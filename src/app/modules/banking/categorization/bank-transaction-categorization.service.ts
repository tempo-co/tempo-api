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

import {BANK_TRANSACTION_FINANCIAL_EVENT_TYPES} from '../bank-transaction-financial-event';
import {BankTransaction} from '../bank-transaction.entity';
import {
	createBankTransactionCategorizationInputHash,
	normalizeMerchantCategoryCode,
	toBankTransactionCategorizationInput,
	toBankTransactionCategorizationWebSearchInput,
} from './bank-transaction-categorization-input';
import {
	BANK_TRANSACTION_CATEGORIZATION_MAX_SEARCH_TRACE_ITEMS,
	BANK_TRANSACTION_CATEGORIZATION_MAX_WEB_SEARCH_QUERY_LENGTH,
	BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
	BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES,
	BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_FAILED_PROMPT_VERSION,
	BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION,
	BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_SKIPPED_PROMPT_VERSION,
} from './bank-transaction-categorization.constants';
import {
	BANK_TRANSACTION_CATEGORIZATION_PROVIDER,
	BankTransactionCategorizationProvider,
	BankTransactionCategorizationProviderError,
} from './bank-transaction-categorization.provider';
import {
	BANK_TRANSACTION_CATEGORIZATION_SEARCH_EVIDENCE_TYPES,
	BankTransactionCategorizationInput,
	BankTransactionCategorizationResult,
	BankTransactionCategorizationSearchTrace,
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
	categorySearchTrace?: BankTransactionCategorizationSearchTrace | null;
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
		await this.enqueueForTransactionsInBatches(transactionIds, this.getCategorizationBatchSize());
	}

	private async enqueueForTransactionsInBatches(transactionIds: readonly string[], batchSize: number): Promise<void> {
		if (!this.isEnabled()) return;

		const uniqueIds = [...new Set(transactionIds.filter((id) => id.length > 0))].sort();
		if (uniqueIds.length === 0) return;

		const transactions = await this.repository.find({
			select: ['id', 'categoryInputHash', 'categorySource', 'financialEventType'],
			where: {id: In(uniqueIds)},
		});
		const financialEventIds = new Set(
			transactions
				.filter(
					({financialEventType}) =>
						financialEventType === BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
				)
				.map(({id}) => id),
		);
		const ruleIds = new Set(transactions.filter(({categorySource}) => categorySource === 'RULE').map(({id}) => id));
		const categorizationIds = uniqueIds.filter((id) => !financialEventIds.has(id) && !ruleIds.has(id));
		if (categorizationIds.length === 0) return;
		const inputHashes = new Map(transactions.map(({id, categoryInputHash}) => [id, categoryInputHash]));
		const jobs = [];
		for (let index = 0; index < categorizationIds.length; index += batchSize) {
			const batch = categorizationIds.slice(index, index + batchSize);
			jobs.push({
				name: CATEGORIZE_BANK_TRANSACTIONS_JOB,
				data: {
					transactionIds: batch,
				},
				opts: {
					jobId: this.createJobId(batch, inputHashes),
					removeOnFail: true,
				},
			});
		}
		await this.queue.addBulk(jobs);
	}

	async processTransactionJob(transactionIds: readonly string[]): Promise<void> {
		if (!this.isEnabled()) return;

		const uniqueIds = [...new Set(transactionIds.filter((id) => id.length > 0))];
		if (uniqueIds.length === 0) return;

		const batchSize = this.getCategorizationBatchSize();
		const batchIds = uniqueIds.slice(0, batchSize);
		const remainingIds = uniqueIds.slice(batchSize);
		if (remainingIds.length > 0) {
			await this.enqueueForTransactionsInBatches(remainingIds, batchSize);
		}

		const transactions = await this.repository.find({
			where: {id: In(batchIds)},
			relations: {bankAccount: {bankConnection: true}},
		});
		const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
		const claimed: ClaimedTransaction[] = [];

		for (const id of batchIds) {
			const transaction = transactionsById.get(id);
			if (!transaction || this.isFinancialEvent(transaction) || transaction.categorySource === 'RULE') continue;

			const input = toBankTransactionCategorizationInput({
				...transaction,
				aspspName: transaction.bankAccount?.bankConnection?.aspspName,
			});
			const inputHash = createBankTransactionCategorizationInputHash(input);
			if (!(await this.refreshInputHashAndResetStaleClassification(transaction, inputHash))) continue;
			if (transaction.categorySource === 'MANUAL' || transaction.categorySource === 'RULE') continue;

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
				.andWhere(`transaction."categorySource" IS DISTINCT FROM 'RULE'`)
				.andWhere('transaction."financialEventType" IS DISTINCT FROM :financialEventType', {
					financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
				})
				.andWhere(
					`(
						transaction."categoryStatus" IN (:...claimableStatuses)
						OR (
							transaction."categoryStatus" = :processingStatus
							AND (
								transaction."categoryUpdatedAt" IS NULL
								OR transaction."categoryUpdatedAt" < :staleBefore
							)
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
		} catch (error) {
			this.logger.warn(`Transaction categorization reconciliation failed: ${this.safeErrorName(error)}`);
		}
	}

	async onApplicationBootstrap(): Promise<void> {
		await this.reconcilePendingTransactions();
	}

	private async categorizeClaimedBatch(batch: readonly ClaimedTransaction[]): Promise<void> {
		const activeBatch = await this.getActiveClaimedTransactions(batch);
		if (activeBatch.length === 0) return;

		const inputs = activeBatch.map(({input}) => input);
		let standardResults: readonly BankTransactionCategorizationResult[];

		try {
			standardResults = await this.provider.categorize(inputs, BANK_TRANSACTION_CATEGORY_DEFINITIONS);
			this.assertCompleteResults(inputs, standardResults);
		} catch (error) {
			await this.markBatchFailed(activeBatch, error);
			if (this.isRetryable(error)) throw error;
			return;
		}

		const activeBatchAfterStandardCategorization = await this.getActiveClaimedTransactions(activeBatch);
		if (activeBatchAfterStandardCategorization.length === 0) return;
		const activeCorrelationIds = new Set(
			activeBatchAfterStandardCategorization.map(({input}) => input.correlationId),
		);
		const inputById = new Map(inputs.map((input) => [input.correlationId, input]));
		const standardResultById = new Map(
			standardResults.map((result) => {
				const normalized = this.normalizeStandardResult(inputById.get(result.correlationId), result);
				return [normalized.correlationId, normalized] as const;
			}),
		);
		const webSearchEnabled = this.isWebSearchEnabled();
		const skippedWebSearchIds = new Set<string>();
		const webCandidates = inputs
			.filter((input) => {
				const category = standardResultById.get(input.correlationId)?.category;
				return (
					activeCorrelationIds.has(input.correlationId) &&
					webSearchEnabled &&
					(category === 'OTHER' || category === 'NEEDS_REVIEW')
				);
			})
			.map((input) => {
				const webSearchInput = toBankTransactionCategorizationWebSearchInput(input);
				if (webSearchEnabled && webSearchInput === null) skippedWebSearchIds.add(input.correlationId);
				return webSearchInput;
			})
			.filter((input): input is NonNullable<typeof input> => input !== null);

		const webResults: BankTransactionCategorizationResult[] = [];
		const failedWebSearchIds = new Set<string>();
		const claimedByCorrelationId = new Map(
			activeBatchAfterStandardCategorization.map((claimed) => [claimed.input.correlationId, claimed]),
		);
		if (webSearchEnabled) {
			for (const webSearchInput of webCandidates) {
				const claimed = claimedByCorrelationId.get(webSearchInput.correlationId);
				if (!claimed) continue;
				const activeBeforeWebSearch = await this.getActiveClaimedTransactions([claimed]);
				if (activeBeforeWebSearch.length === 0) {
					activeCorrelationIds.delete(webSearchInput.correlationId);
					continue;
				}
				try {
					const candidateResults = await this.provider.categorizeWithWebSearch(
						[webSearchInput],
						BANK_TRANSACTION_CATEGORY_DEFINITIONS,
					);
					this.assertCompleteResults([webSearchInput], candidateResults);
					webResults.push(...candidateResults.map((result) => this.normalizeWebSearchResult(result)));
				} catch (error) {
					this.logger.warn(`Transaction web-search fallback failed: ${this.safeErrorName(error)}`);
					failedWebSearchIds.add(webSearchInput.correlationId);
				}
			}
		}

		for (const result of webResults) standardResultById.set(result.correlationId, result);
		const webResultIds = new Set(webResults.map(({correlationId}) => correlationId));
		for (const claimed of activeBatchAfterStandardCategorization) {
			const result = standardResultById.get(claimed.input.correlationId);
			if (!result) continue;
			const promptVersion = webResultIds.has(claimed.input.correlationId)
				? BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION
				: skippedWebSearchIds.has(claimed.input.correlationId)
					? BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_SKIPPED_PROMPT_VERSION
					: failedWebSearchIds.has(claimed.input.correlationId)
						? BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_FAILED_PROMPT_VERSION
						: BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION;
			const completionValues = {
				category: result.category,
				categoryStatus: 'COMPLETED',
				categorySource: 'AI',
				categoryConfidence: String(result.confidence),
				categoryAppliedInputHash: claimed.inputHash,
				categoryProvider: this.configurationService.get('AI_CATEGORIZATION_PROVIDER'),
				categoryModel: this.configurationService.get('AI_CATEGORIZATION_MODEL'),
				categoryPromptVersion: promptVersion,
				categorySearchTrace: result.searchTrace ?? null,
				categoryLastError: null,
			};
			const applied = await this.updateCategorizationWithGuard(
				claimed.transaction.id,
				claimed.inputHash,
				{
					...completionValues,
					categoryUpdatedAt: new Date(),
				},
				'PROCESSING',
			);
			if (applied) this.applyLocalUpdate(claimed.transaction, completionValues);
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
					financialEventType: IsNull(),
					categoryStatus: transaction.categoryStatus ?? IsNull(),
				},
				{categoryInputHash: inputHash},
			);
			if ((result.affected ?? 0) === 0) return false;
			transaction.categoryInputHash = inputHash;
		}

		if (transaction.categorySource === 'MANUAL') return true;
		if (transaction.categoryStatus === 'COMPLETED') return true;
		const appliedHashIsStale =
			transaction.categoryAppliedInputHash !== null && transaction.categoryAppliedInputHash !== inputHash;
		if (!appliedHashIsStale) return true;

		const reset = await this.updateCategorizationWithGuard(
			transaction.id,
			inputHash,
			{
				...BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES,
				categoryStatus: 'PENDING',
				categoryUpdatedAt: new Date(),
			},
			transaction.categoryStatus ?? undefined,
		);
		if (reset)
			this.applyLocalUpdate(transaction, {
				...BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES,
				categoryStatus: 'PENDING',
			});
		return true;
	}

	private async getActiveClaimedTransactions(batch: readonly ClaimedTransaction[]): Promise<ClaimedTransaction[]> {
		const currentTransactions = await this.repository.find({
			select: ['id', 'financialEventType'],
			where: {id: In(batch.map(({transaction}) => transaction.id))},
		});
		const currentTransactionsById = new Map(
			currentTransactions.map((transaction) => [transaction.id, transaction]),
		);
		return batch.filter(({transaction}) => {
			const currentTransaction = currentTransactionsById.get(transaction.id);
			return (
				currentTransaction !== undefined &&
				currentTransaction.financialEventType !== BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE
			);
		});
	}

	private async claimTransaction(id: string, inputHash: string): Promise<boolean> {
		const result = await this.repository
			.createQueryBuilder()
			.update(BankTransaction)
			.set({categoryStatus: 'PROCESSING', categoryUpdatedAt: new Date()})
			.where('id = :id', {id})
			.andWhere(`"categorySource" IS DISTINCT FROM 'MANUAL'`)
			.andWhere(`"categorySource" IS DISTINCT FROM 'RULE'`)
			.andWhere('"categoryInputHash" = :inputHash', {inputHash})
			.andWhere('"financialEventType" IS DISTINCT FROM :financialEventType', {
				financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
			})
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
			.andWhere(`"categorySource" IS DISTINCT FROM 'RULE'`)
			.andWhere('"categoryInputHash" = :inputHash', {inputHash})
			.andWhere('"financialEventType" IS DISTINCT FROM :financialEventType', {
				financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
			});
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
						...BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES,
						categoryStatus: 'FAILED',
						categoryUpdatedAt: new Date(),
						categoryLastError: safeMessage,
					},
					'PROCESSING',
				);
				if (failed)
					this.applyLocalUpdate(transaction, {
						...BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES,
						categoryStatus: 'FAILED',
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
					result.confidence > 1 ||
					!this.isValidSearchTrace(result.searchTrace),
			)
		) {
			throw new BankTransactionCategorizationProviderError('Invalid categorization provider result.', false);
		}
	}

	private normalizeStandardResult(
		input: BankTransactionCategorizationInput | undefined,
		result: BankTransactionCategorizationResult,
	): BankTransactionCategorizationResult {
		if (
			input &&
			result.category === 'TRANSPORTATION' &&
			input.transactionType === 'CARD_PAYMENT' &&
			!normalizeMerchantCategoryCode(input.merchantCategoryCode) &&
			input.counterpartyName === null
		) {
			return {...result, category: 'NEEDS_REVIEW', confidence: 0};
		}
		return result;
	}

	private normalizeWebSearchResult(result: BankTransactionCategorizationResult): BankTransactionCategorizationResult {
		const evidenceType = result.searchTrace?.evidenceType;
		if (
			evidenceType === 'INSUFFICIENT' ||
			evidenceType === 'CONFLICTING' ||
			(result.category === 'TRANSPORTATION' && evidenceType !== 'PURCHASE_CONTEXT' && evidenceType !== 'MCC')
		) {
			return {...result, category: 'NEEDS_REVIEW', confidence: 0};
		}
		return result;
	}

	private isValidSearchTrace(trace: BankTransactionCategorizationSearchTrace | undefined): boolean {
		if (trace === undefined) return true;
		return (
			Array.isArray(trace.queries) &&
			trace.queries.length <= 1 &&
			trace.queries.every(
				(query) =>
					typeof query === 'string' &&
					query.length > 0 &&
					query.length <= BANK_TRANSACTION_CATEGORIZATION_MAX_WEB_SEARCH_QUERY_LENGTH &&
					!/[\u0000-\u001f\u007f]/.test(query),
			) &&
			Array.isArray(trace.sourceDomains) &&
			trace.sourceDomains.length <= BANK_TRANSACTION_CATEGORIZATION_MAX_SEARCH_TRACE_ITEMS &&
			trace.sourceDomains.every((domain) => this.isValidSearchTraceDomain(domain)) &&
			BANK_TRANSACTION_CATEGORIZATION_SEARCH_EVIDENCE_TYPES.includes(trace.evidenceType)
		);
	}

	private isValidSearchTraceDomain(domain: unknown): boolean {
		return (
			typeof domain === 'string' &&
			/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)
		);
	}

	private isFinancialEvent(transaction: BankTransaction): boolean {
		return transaction.financialEventType === BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE;
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

	private getCategorizationBatchSize(): number {
		return BANK_TRANSACTION_CATEGORIZATION_BATCH_SIZE;
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
