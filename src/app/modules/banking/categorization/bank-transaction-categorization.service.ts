import {InjectQueue} from '@nestjs/bullmq';
import {Inject, Injectable, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Queue} from 'bullmq';
import {createHash} from 'node:crypto';
import {In, IsNull, Repository} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {
	BANK_TRANSACTION_CATEGORIZATION_BATCH_SIZE,
	BANK_TRANSACTION_CATEGORIZATION_QUEUE,
	CATEGORIZE_BANK_TRANSACTIONS_JOB,
} from '@core/queue/queue.constants';

import {BankTransaction} from '../bank-transaction.entity';
import {
	createBankTransactionCategorizationInputHash,
	toBankTransactionCategorizationInput,
	toBankTransactionCategorizationWebSearchInput,
} from './bank-transaction-categorization-input';
import {
	BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
	BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION,
} from './bank-transaction-categorization.constants';
import {
	BANK_TRANSACTION_CATEGORIZATION_PROVIDER,
	BankTransactionCategorizationProvider,
	BankTransactionCategorizationProviderError,
} from './bank-transaction-categorization.provider';
import {
	BankTransactionCategorizationInput,
	BankTransactionCategorizationResult,
} from './bank-transaction-categorization.types';
import {BANK_TRANSACTION_CATEGORIES, BANK_TRANSACTION_CATEGORY_DEFINITIONS} from './bank-transaction-category';

export type BankTransactionCategorizationJobData = {
	transactionIds: string[];
};

type ClaimedTransaction = {
	transaction: BankTransaction;
	input: BankTransactionCategorizationInput;
	inputHash: string;
};

type CategorizationUpdate = {
	category?: string | null;
	categoryStatus?: string;
	categorySource?: string | null;
	categoryConfidence?: string | null;
	categoryAppliedInputHash?: string | null;
	categoryProvider?: string | null;
	categoryModel?: string | null;
	categoryPromptVersion?: string | null;
	categoryUpdatedAt?: Date;
	categoryLastError?: string | null;
};

const STALE_PROCESSING_AFTER_MS = 15 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;
const CLAIMABLE_STATUSES = ['PENDING', 'FAILED'] as const;

@Injectable()
export class BankTransactionCategorizationService {
	private readonly logger = new Logger(BankTransactionCategorizationService.name);

	constructor(
		@InjectRepository(BankTransaction)
		private readonly repository: Repository<BankTransaction>,
		@InjectQueue(BANK_TRANSACTION_CATEGORIZATION_QUEUE)
		private readonly queue: Queue<BankTransactionCategorizationJobData>,
		@Inject(BANK_TRANSACTION_CATEGORIZATION_PROVIDER)
		private readonly provider: BankTransactionCategorizationProvider,
		private readonly configurationService: ConfigurationService,
	) {}

	async enqueueForTransactions(transactionIds: readonly string[]): Promise<void> {
		await this.enqueueForTransactionsInBatches(transactionIds, BANK_TRANSACTION_CATEGORIZATION_BATCH_SIZE);
	}

	private async enqueueForTransactionsInBatches(transactionIds: readonly string[], batchSize: number): Promise<void> {
		if (!this.isEnabled()) return;

		const uniqueIds = [...new Set(transactionIds.filter((id) => id.length > 0))].sort();
		if (uniqueIds.length === 0) return;

		const transactions = await this.repository.find({
			select: ['id', 'categoryInputHash'],
			where: {id: In(uniqueIds)},
		});
		const inputHashes = new Map(transactions.map(({id, categoryInputHash}) => [id, categoryInputHash]));
		const jobs = [];
		for (let index = 0; index < uniqueIds.length; index += batchSize) {
			const batch = uniqueIds.slice(index, index + batchSize);
			jobs.push({
				name: CATEGORIZE_BANK_TRANSACTIONS_JOB,
				data: {transactionIds: batch},
				opts: {jobId: this.createJobId(batch, inputHashes), removeOnFail: true},
			});
		}
		await this.queue.addBulk(jobs);
	}

	async processTransactionJob(transactionIds: readonly string[]): Promise<void> {
		if (!this.isEnabled()) return;

		const uniqueIds = [...new Set(transactionIds.filter((id) => id.length > 0))];
		if (uniqueIds.length === 0) return;

		const transactions = await this.repository.find({where: {id: In(uniqueIds)}});
		const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
		const claimed: ClaimedTransaction[] = [];

		for (const id of uniqueIds) {
			const transaction = transactionsById.get(id);
			if (!transaction) continue;

			const input = toBankTransactionCategorizationInput(transaction);
			const inputHash = createBankTransactionCategorizationInputHash(input);
			if (!(await this.refreshInputHashAndResetStaleClassification(transaction, inputHash))) continue;
			if (transaction.categorySource === 'MANUAL') continue;

			if (!this.isClaimable(transaction)) continue;
			if (await this.claimTransaction(transaction.id, inputHash)) {
				this.applyLocalUpdate(transaction, {categoryStatus: 'PROCESSING', categoryUpdatedAt: new Date()});
				claimed.push({transaction, input, inputHash});
			}
		}

		for (let index = 0; index < claimed.length; index += BANK_TRANSACTION_CATEGORIZATION_BATCH_SIZE) {
			const batch = claimed.slice(index, index + BANK_TRANSACTION_CATEGORIZATION_BATCH_SIZE);
			await this.categorizeClaimedBatch(batch);
		}
	}

	async reconcilePendingTransactions(): Promise<void> {
		if (!this.isEnabled()) return;

		try {
			const rows = await this.repository
				.createQueryBuilder('transaction')
				.select('transaction.id', 'id')
				.where(`transaction."categorySource" IS DISTINCT FROM 'MANUAL'`)
				.andWhere(
					`(
						transaction."categoryStatus" IN (:...claimableStatuses)
						OR transaction."categoryInputHash" IS NULL
						OR transaction."categoryAppliedInputHash" IS DISTINCT FROM transaction."categoryInputHash"
						OR (
							transaction."categoryStatus" = :processingStatus
							AND (
								transaction."categoryUpdatedAt" IS NULL
								OR transaction."categoryUpdatedAt" < :staleBefore
							)
						)
						OR (
							transaction."categoryStatus" = 'COMPLETED'
							AND transaction."categorySource" IS DISTINCT FROM 'AI'
						)
					)`,
					{
						claimableStatuses: CLAIMABLE_STATUSES,
						processingStatus: 'PROCESSING',
						staleBefore: new Date(Date.now() - STALE_PROCESSING_AFTER_MS),
					},
				)
				.getRawMany<{id: string}>();

			await this.enqueueForTransactions(rows.map(({id}) => id));
			await this.reconcileCompletedOtherTransactionsForWebSearch();
		} catch (error) {
			this.logger.warn(`Transaction categorization reconciliation failed: ${this.safeErrorName(error)}`);
		}
	}

	async onApplicationBootstrap(): Promise<void> {
		await this.reconcilePendingTransactions();
	}

	private async reconcileCompletedOtherTransactionsForWebSearch(): Promise<void> {
		const webSearchMaxTransactions = this.configurationService.get('AI_CATEGORIZATION_WEB_SEARCH_MAX_TRANSACTIONS');
		if (!this.isWebSearchEnabled() || webSearchMaxTransactions < 1) return;

		const rows = await this.repository
			.createQueryBuilder('transaction')
			.select('transaction.id', 'id')
			.where('transaction."category" = \'OTHER\'')
			.andWhere('transaction."categoryStatus" = \'COMPLETED\'')
			.andWhere('transaction."categorySource" IS DISTINCT FROM \'MANUAL\'')
			.andWhere('transaction."categoryPromptVersion" IS DISTINCT FROM :webSearchPromptVersion', {
				webSearchPromptVersion: BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION,
			})
			.getRawMany<{id: string}>();
		if (rows.length === 0) return;

		const transactionIds = rows.map(({id}) => id);
		await this.repository
			.createQueryBuilder()
			.update(BankTransaction)
			.set({
				category: null,
				categoryStatus: 'PENDING',
				categorySource: null,
				categoryConfidence: null,
				categoryAppliedInputHash: null,
				categoryProvider: null,
				categoryModel: null,
				categoryPromptVersion: null,
				categoryUpdatedAt: new Date(),
				categoryLastError: null,
			})
			.where('"id" IN (:...transactionIds)', {transactionIds})
			.andWhere('"category" = \'OTHER\'')
			.andWhere('"categoryStatus" = \'COMPLETED\'')
			.andWhere('"categorySource" IS DISTINCT FROM \'MANUAL\'')
			.andWhere('"categoryPromptVersion" IS DISTINCT FROM :webSearchPromptVersion', {
				webSearchPromptVersion: BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION,
			})
			.execute();

		await this.enqueueForTransactionsInBatches(transactionIds, webSearchMaxTransactions);
	}

	private async categorizeClaimedBatch(batch: readonly ClaimedTransaction[]): Promise<void> {
		const inputs = batch.map(({input}) => input);
		let standardResults: readonly BankTransactionCategorizationResult[];

		try {
			standardResults = await this.provider.categorize(inputs, BANK_TRANSACTION_CATEGORY_DEFINITIONS);
			this.assertCompleteResults(inputs, standardResults);
		} catch (error) {
			await this.markBatchFailed(batch, error);
			if (this.isRetryable(error)) throw error;
			return;
		}

		const standardResultById = new Map(standardResults.map((result) => [result.correlationId, result]));
		const webCandidates = inputs
			.filter((input) => standardResultById.get(input.correlationId)?.category === 'OTHER')
			.map(toBankTransactionCategorizationWebSearchInput)
			.filter((input): input is NonNullable<typeof input> => input !== null)
			.slice(0, this.configurationService.get('AI_CATEGORIZATION_WEB_SEARCH_MAX_TRANSACTIONS'));

		let webResults: readonly BankTransactionCategorizationResult[] = [];
		if (this.isWebSearchEnabled() && webCandidates.length > 0) {
			try {
				webResults = await this.provider.categorizeWithWebSearch(
					webCandidates,
					BANK_TRANSACTION_CATEGORY_DEFINITIONS,
				);
				this.assertCompleteResults(webCandidates, webResults);
			} catch (error) {
				this.logger.warn(`Transaction web-search fallback failed: ${this.safeErrorName(error)}`);
				webResults = [];
			}
		}

		const resultById = new Map(standardResults.map((result) => [result.correlationId, result]));
		for (const result of webResults) resultById.set(result.correlationId, result);
		const webResultIds = new Set(webResults.map(({correlationId}) => correlationId));
		for (const claimed of batch) {
			const result = resultById.get(claimed.input.correlationId);
			if (!result) continue;
			const promptVersion = webResultIds.has(claimed.input.correlationId)
				? BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION
				: BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION;
			const applied = await this.updateCategorizationWithGuard(
				claimed.transaction.id,
				claimed.inputHash,
				{
					category: result.category,
					categoryStatus: 'COMPLETED',
					categorySource: 'AI',
					categoryConfidence: String(result.confidence),
					categoryAppliedInputHash: claimed.inputHash,
					categoryProvider: this.configurationService.get('AI_CATEGORIZATION_PROVIDER'),
					categoryModel: this.configurationService.get('AI_CATEGORIZATION_MODEL'),
					categoryPromptVersion: promptVersion,
					categoryUpdatedAt: new Date(),
					categoryLastError: null,
				},
				'PROCESSING',
			);
			if (applied)
				this.applyLocalUpdate(claimed.transaction, {
					category: result.category,
					categoryStatus: 'COMPLETED',
					categorySource: 'AI',
					categoryConfidence: String(result.confidence),
					categoryAppliedInputHash: claimed.inputHash,
					categoryProvider: this.configurationService.get('AI_CATEGORIZATION_PROVIDER'),
					categoryModel: this.configurationService.get('AI_CATEGORIZATION_MODEL'),
					categoryPromptVersion: promptVersion,
					categoryLastError: null,
				});
		}
	}

	private async refreshInputHashAndResetStaleClassification(
		transaction: BankTransaction,
		inputHash: string,
	): Promise<boolean> {
		const previousHash = transaction.categoryInputHash;
		const hashChanged = previousHash !== inputHash;
		if (hashChanged) {
			const result = await this.repository.update(
				{
					id: transaction.id,
					categoryInputHash: previousHash == null ? IsNull() : previousHash,
				},
				{categoryInputHash: inputHash},
			);
			if ((result.affected ?? 0) === 0) return false;
			transaction.categoryInputHash = inputHash;
		}

		if (transaction.categorySource === 'MANUAL') return true;
		const appliedHashIsStale =
			transaction.categoryAppliedInputHash !== null && transaction.categoryAppliedInputHash !== inputHash;
		const completedHashIsStale =
			transaction.categoryStatus === 'COMPLETED' && transaction.categoryAppliedInputHash !== inputHash;
		const completedByNonAiSource =
			transaction.categoryStatus === 'COMPLETED' && transaction.categorySource !== 'AI';
		if (!appliedHashIsStale && !completedByNonAiSource && !(hashChanged && completedHashIsStale)) return true;

		const reset = await this.updateCategorizationWithGuard(transaction.id, inputHash, {
			category: null,
			categoryStatus: 'PENDING',
			categorySource: null,
			categoryConfidence: null,
			categoryAppliedInputHash: null,
			categoryProvider: null,
			categoryModel: null,
			categoryPromptVersion: null,
			categoryUpdatedAt: new Date(),
			categoryLastError: null,
		});
		if (reset)
			this.applyLocalUpdate(transaction, {
				category: null,
				categoryStatus: 'PENDING',
				categorySource: null,
				categoryConfidence: null,
				categoryAppliedInputHash: null,
				categoryProvider: null,
				categoryModel: null,
				categoryPromptVersion: null,
				categoryLastError: null,
			});
		return true;
	}

	private async claimTransaction(id: string, inputHash: string): Promise<boolean> {
		const result = await this.repository
			.createQueryBuilder()
			.update(BankTransaction)
			.set({categoryStatus: 'PROCESSING', categoryUpdatedAt: new Date()})
			.where('id = :id', {id})
			.andWhere(`"categorySource" IS DISTINCT FROM 'MANUAL'`)
			.andWhere('"categoryInputHash" = :inputHash', {inputHash})
			.andWhere(
				`(
					"categoryStatus" IN (:...claimableStatuses)
					OR (
						"categoryStatus" = :processingStatus
						AND ("categoryUpdatedAt" IS NULL OR "categoryUpdatedAt" < :staleBefore)
					)
				)`,
				{
					claimableStatuses: CLAIMABLE_STATUSES,
					processingStatus: 'PROCESSING',
					staleBefore: new Date(Date.now() - STALE_PROCESSING_AFTER_MS),
				},
			)
			.returning('id')
			.execute();
		return (result.affected ?? 0) > 0;
	}

	private async updateCategorizationWithGuard(
		id: string,
		inputHash: string,
		values: CategorizationUpdate,
		status?: string,
	): Promise<boolean> {
		const query = this.repository
			.createQueryBuilder()
			.update(BankTransaction)
			.set(values)
			.where('id = :id', {id})
			.andWhere(`"categorySource" IS DISTINCT FROM 'MANUAL'`)
			.andWhere('"categoryInputHash" = :inputHash', {inputHash});
		if (status) query.andWhere('"categoryStatus" = :expectedStatus', {expectedStatus: status});
		const result = await query.execute();
		return (result.affected ?? 0) > 0;
	}

	private async markBatchFailed(batch: readonly ClaimedTransaction[], error: unknown): Promise<void> {
		const safeMessage = this.safeFailureMessage(error);
		await Promise.all(
			batch.map(async ({transaction, inputHash}) => {
				const failed = await this.updateCategorizationWithGuard(
					transaction.id,
					inputHash,
					{
						category: null,
						categoryStatus: 'FAILED',
						categorySource: null,
						categoryConfidence: null,
						categoryAppliedInputHash: null,
						categoryProvider: null,
						categoryModel: null,
						categoryPromptVersion: null,
						categoryUpdatedAt: new Date(),
						categoryLastError: safeMessage,
					},
					'PROCESSING',
				);
				if (failed)
					this.applyLocalUpdate(transaction, {
						category: null,
						categoryStatus: 'FAILED',
						categorySource: null,
						categoryConfidence: null,
						categoryAppliedInputHash: null,
						categoryProvider: null,
						categoryModel: null,
						categoryPromptVersion: null,
						categoryLastError: safeMessage,
					});
			}),
		);
	}

	private assertCompleteResults(
		inputs: readonly {correlationId: string}[],
		results: readonly BankTransactionCategorizationResult[],
	): void {
		const inputIds = inputs.map(({correlationId}) => correlationId);
		const resultIds = results.map(({correlationId}) => correlationId);
		const resultIdSet = new Set(resultIds);
		if (
			resultIds.length !== resultIdSet.size ||
			resultIds.length !== inputIds.length ||
			inputIds.some((id) => !resultIdSet.has(id)) ||
			results.some(
				(result) =>
					!(BANK_TRANSACTION_CATEGORIES as readonly string[]).includes(result.category) ||
					!Number.isFinite(result.confidence) ||
					result.confidence < 0 ||
					result.confidence > 1,
			)
		) {
			throw new BankTransactionCategorizationProviderError('Invalid categorization provider result.', false);
		}
	}

	private isClaimable(transaction: BankTransaction): boolean {
		const status = transaction.categoryStatus ?? 'PENDING';
		if (CLAIMABLE_STATUSES.includes(status as (typeof CLAIMABLE_STATUSES)[number])) return true;
		if (status !== 'PROCESSING') return false;
		if (!transaction.categoryUpdatedAt) return true;
		const updatedAt =
			transaction.categoryUpdatedAt instanceof Date
				? transaction.categoryUpdatedAt
				: new Date(transaction.categoryUpdatedAt);
		return Number.isNaN(updatedAt.getTime()) || updatedAt.getTime() < Date.now() - STALE_PROCESSING_AFTER_MS;
	}

	private applyLocalUpdate(transaction: BankTransaction, values: CategorizationUpdate): void {
		Object.assign(transaction, values);
	}

	private createJobId(transactionIds: readonly string[], inputHashes: ReadonlyMap<string, string | null>): string {
		const jobInput = transactionIds.map((id) => `${id}:${inputHashes.get(id) ?? ''}`).join('\n');
		return `categorize-${createHash('sha256').update(jobInput).digest('hex')}`;
	}

	private isEnabled(): boolean {
		return this.configurationService.get('AI_CATEGORIZATION_ENABLED');
	}

	private isWebSearchEnabled(): boolean {
		return this.configurationService.get('AI_CATEGORIZATION_WEB_SEARCH_ENABLED');
	}

	private isRetryable(error: unknown): boolean {
		return error instanceof BankTransactionCategorizationProviderError && error.retryable;
	}

	private safeFailureMessage(error: unknown): string {
		if (
			error instanceof BankTransactionCategorizationProviderError &&
			/^OpenAI (?:categorization request failed|returned an invalid)/.test(error.message)
		) {
			return error.message.slice(0, MAX_ERROR_LENGTH);
		}
		return 'Transaction categorization failed.';
	}

	private safeErrorName(error: unknown): string {
		return error instanceof Error && error.name.length > 0 ? error.name : 'UnknownError';
	}
}
