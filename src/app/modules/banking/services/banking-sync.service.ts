import {ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {createHash} from 'node:crypto';
import {DataSource, Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {
	BANKING_CONNECTION_NOT_AUTHORIZED,
	BANKING_CONNECTION_NOT_FOUND,
	BANKING_CONNECTION_SESSION_UNAVAILABLE,
	BANKING_CONSENT_EXPIRED,
	BANKING_FAILED_SYNC_ERROR,
	BANKING_INTERNAL_ERROR,
	BANKING_PARTIAL_SYNC_ERROR,
	BANKING_PERSISTENCE_SYNC_ERROR,
} from '../api/constants/banking-messages.constants';
import {BankSyncRunResponseDto} from '../api/dtos/bank-connection-response.dto';
import {BankAccountBalance} from '../bank-account-balance.entity';
import {BankAccount} from '../bank-account.entity';
import {BankConnection} from '../bank-connection.entity';
import {BankSyncRun} from '../bank-sync-run.entity';
import {getBankTransactionDisplayDescription} from '../bank-transaction-display';
import {normalizeBankTransactionType} from '../bank-transaction-type';
import {BankTransaction} from '../bank-transaction.entity';
import {selectPreferredBalance, truncate} from '../banking.utils';
import {
	EnableBankingBalance,
	EnableBankingTransaction,
	EnableBankingTransactionFetchOptions,
} from '../enable-banking.types';
import {BankingEncryptionError} from '../errors/banking-encryption.error';
import {BankingConnectionLock, BankingConnectionLockService} from './banking-connection-lock.service';
import {BankingEncryptionService} from './banking-encryption.service';
import {EnableBankingClient, EnableBankingClientError} from './enable-banking.client';

const AUTHORIZED = 'AUTHORIZED';
const EXPIRED = 'EXPIRED';
const RUNNING = 'RUNNING';
const SUCCEEDED = 'SUCCEEDED';
const FAILED = 'FAILED';
const PARTIAL = 'PARTIAL';

const INCREMENTAL_OVERLAP_DAYS = 7;
const ENABLE_BANKING_BACKGROUND_RETRY_AFTER_SECONDS = 6 * 60 * 60;

type AccountFetchResult = {
	bankAccount: BankAccount;
	balances: EnableBankingBalance[];
	transactions: EnableBankingTransaction[];
	balancesSucceeded: boolean;
	transactionsSucceeded: boolean;
};

type SyncFetchResult = {
	accounts: AccountFetchResult[];
	knownAccounts: BankAccount[];
	authoritativeAccountIds: Set<string> | null;
	hasFailure: boolean;
	hasSuccessfulEndpoint: boolean;
	connectionExpired: boolean;
	rateLimit?: SyncRateLimit;
};

type SyncRateLimit = {
	source: 'enable-banking';
	retryAfterSeconds: number;
};

@Injectable()
export class BankingSyncService {
	private readonly logger = new Logger(BankingSyncService.name);

	constructor(
		@InjectRepository(BankConnection)
		private readonly bankConnectionRepository: Repository<BankConnection>,
		@InjectRepository(BankAccount)
		private readonly bankAccountRepository: Repository<BankAccount>,
		@InjectRepository(BankSyncRun)
		private readonly bankSyncRunRepository: Repository<BankSyncRun>,
		private readonly dataSource: DataSource,
		private readonly enableBankingClient: EnableBankingClient,
		private readonly encryptionService: BankingEncryptionService,
		private readonly connectionLockService: BankingConnectionLockService,
	) {}

	async synchronize(accountId: Account['id'], connectionId: BankConnection['id']): Promise<BankSyncRunResponseDto> {
		await this.findOwnedConnection(accountId, connectionId);
		const lockLease = await this.connectionLockService.acquire(connectionId);

		try {
			const connection = await this.findOwnedConnection(accountId, connectionId);
			const providerSessionId = await this.validateConnection(connection);

			const bankAccounts = await this.bankAccountRepository.find({
				where: {bankConnection: {id: connection.id}},
				order: {createdAt: 'ASC'},
			});
			const previousSuccessfulRun = await this.findPreviousSuccessfulRun(connection.id);
			const requestedTo = this.toDateOnly(new Date()) as string;
			const requestedFrom = previousSuccessfulRun
				? this.subtractDays(previousSuccessfulRun.requestedTo ?? requestedTo, INCREMENTAL_OVERLAP_DAYS)
				: null;
			const transactionOptions: EnableBankingTransactionFetchOptions = previousSuccessfulRun
				? {strategy: 'default', dateFrom: requestedFrom ?? undefined, dateTo: requestedTo}
				: {strategy: 'longest'};

			const run = await this.bankSyncRunRepository.save(
				this.bankSyncRunRepository.create({
					bankConnection: {id: connection.id},
					status: RUNNING,
					requestedFrom,
					requestedTo,
				}),
			);

			let fetchResult: SyncFetchResult;
			try {
				fetchResult = await this.fetchAccounts(bankAccounts, providerSessionId, transactionOptions, lockLease);
			} catch {
				lockLease.assertHealthy();
				fetchResult = {
					accounts: [],
					knownAccounts: bankAccounts,
					authoritativeAccountIds: null,
					hasFailure: true,
					hasSuccessfulEndpoint: false,
					connectionExpired: false,
				};
			}
			lockLease.assertHealthy();

			const status = this.getRunStatus(fetchResult);
			const finishedAt = new Date();

			let transactionsAdded: number;
			try {
				transactionsAdded = await this.persistSync(connection, run, fetchResult, status, finishedAt);
			} catch {
				await this.markPersistenceFailure(connection.id, run.id);
				throw new InternalServerErrorException(BANKING_PERSISTENCE_SYNC_ERROR);
			}
			lockLease.assertHealthy();

			const completedRun = await this.bankSyncRunRepository.findOneBy({id: run.id});
			if (!completedRun) throw new InternalServerErrorException(BANKING_PERSISTENCE_SYNC_ERROR);
			lockLease.assertHealthy();

			return this.toSyncRunResponse(completedRun, transactionsAdded, fetchResult.rateLimit);
		} finally {
			lockLease.stop();
			try {
				await lockLease.release();
			} catch {
				this.logger.warn('Bank synchronization lock release failed.');
			}
		}
	}

	private async findOwnedConnection(accountId: Account['id'], connectionId: BankConnection['id']) {
		const connection = await this.bankConnectionRepository.findOne({
			where: {id: connectionId, account: {id: accountId}},
		});
		if (!connection) throw new NotFoundException(BANKING_CONNECTION_NOT_FOUND);
		return connection;
	}

	private async validateConnection(connection: BankConnection): Promise<string> {
		if (connection.status !== AUTHORIZED) {
			throw new ConflictException(BANKING_CONNECTION_NOT_AUTHORIZED);
		}

		if (!connection.providerSessionId) {
			throw new ConflictException(BANKING_CONNECTION_SESSION_UNAVAILABLE);
		}

		let providerSessionId: string;
		try {
			providerSessionId = this.encryptionService.decrypt(connection.providerSessionId);
		} catch (error) {
			if (error instanceof BankingEncryptionError) {
				throw new ConflictException(BANKING_CONNECTION_SESSION_UNAVAILABLE);
			}
			throw new InternalServerErrorException(BANKING_INTERNAL_ERROR);
		}

		if (!connection.consentValidUntil || connection.consentValidUntil.getTime() <= Date.now()) {
			await this.bankConnectionRepository.update(
				{id: connection.id},
				{status: EXPIRED, lastSyncError: BANKING_CONSENT_EXPIRED},
			);
			throw new ConflictException(BANKING_CONSENT_EXPIRED);
		}

		return providerSessionId;
	}

	private async findPreviousSuccessfulRun(connectionId: BankConnection['id']): Promise<BankSyncRun | null> {
		return this.bankSyncRunRepository.findOne({
			where: {bankConnection: {id: connectionId}, status: SUCCEEDED},
			order: {finishedAt: 'DESC'},
		});
	}

	private async fetchAccounts(
		bankAccounts: BankAccount[],
		providerSessionId: string,
		transactionOptions: EnableBankingTransactionFetchOptions,
		lockLease: BankingConnectionLock,
	): Promise<SyncFetchResult> {
		const accounts: AccountFetchResult[] = [];
		let authoritativeAccountIds: Set<string> | null = null;
		let hasFailure = false;
		let hasSuccessfulEndpoint = false;
		let connectionExpired = false;
		let rateLimit: SyncRateLimit | undefined;

		try {
			const sessionAccounts = await this.enableBankingClient.getSessionAccounts(
				providerSessionId,
				lockLease.signal,
			);
			lockLease.assertHealthy();

			if (sessionAccounts.status !== AUTHORIZED) {
				throw new EnableBankingClientError('provider_session_not_authorized');
			}

			authoritativeAccountIds = new Set(sessionAccounts.accountIds);
			hasSuccessfulEndpoint = true;
		} catch (error) {
			lockLease.assertHealthy();
			hasFailure = true;
			connectionExpired ||= this.isExpiredSessionError(error);
			rateLimit = this.mergeRateLimit(rateLimit, this.toRateLimit(error));
		}

		if (connectionExpired) {
			return {
				accounts,
				knownAccounts: bankAccounts,
				authoritativeAccountIds,
				hasFailure,
				hasSuccessfulEndpoint,
				connectionExpired,
				rateLimit,
			};
		}

		for (const bankAccount of bankAccounts) {
			lockLease.assertHealthy();
			if (authoritativeAccountIds && !authoritativeAccountIds.has(bankAccount.providerAccountId)) continue;
			if (!authoritativeAccountIds && !bankAccount.isActive) continue;

			let balances: EnableBankingBalance[] = [];
			let transactions: EnableBankingTransaction[] = [];
			let balancesSucceeded = false;
			let transactionsSucceeded = false;

			try {
				balances = await this.enableBankingClient.getAccountBalances(
					bankAccount.providerAccountId,
					lockLease.signal,
				);
				lockLease.assertHealthy();
				balancesSucceeded = true;
				hasSuccessfulEndpoint = true;
			} catch (error) {
				lockLease.assertHealthy();
				hasFailure = true;
				connectionExpired ||= this.isExpiredSessionError(error);
				rateLimit = this.mergeRateLimit(rateLimit, this.toRateLimit(error));
			}

			if (connectionExpired) break;

			try {
				transactions = await this.enableBankingClient.getAccountTransactions(
					bankAccount.providerAccountId,
					transactionOptions,
					lockLease.signal,
				);
				lockLease.assertHealthy();
				transactionsSucceeded = true;
				hasSuccessfulEndpoint = true;
			} catch (error) {
				lockLease.assertHealthy();
				hasFailure = true;
				connectionExpired ||= this.isExpiredSessionError(error);
				rateLimit = this.mergeRateLimit(rateLimit, this.toRateLimit(error));
			}

			accounts.push({
				bankAccount,
				balances,
				transactions,
				balancesSucceeded,
				transactionsSucceeded,
			});

			if (connectionExpired) break;
			lockLease.assertHealthy();
		}

		return {
			accounts,
			knownAccounts: bankAccounts,
			authoritativeAccountIds,
			hasFailure,
			hasSuccessfulEndpoint,
			connectionExpired,
			rateLimit,
		};
	}

	private getRunStatus(fetchResult: SyncFetchResult): string {
		if (!fetchResult.hasFailure) return SUCCEEDED;
		return fetchResult.hasSuccessfulEndpoint ? PARTIAL : FAILED;
	}

	private async persistSync(
		connection: BankConnection,
		run: BankSyncRun,
		fetchResult: SyncFetchResult,
		status: string,
		finishedAt: Date,
	): Promise<number> {
		let errorMessage: string | null = null;
		let transactionsAdded = 0;
		if (fetchResult.connectionExpired) {
			errorMessage = BANKING_CONSENT_EXPIRED;
		} else if (status === PARTIAL) {
			errorMessage = BANKING_PARTIAL_SYNC_ERROR;
		} else if (status === FAILED) {
			errorMessage = BANKING_FAILED_SYNC_ERROR;
		}

		await this.dataSource.transaction(async (manager) => {
			const connectionRepository = manager.getRepository(BankConnection);
			const runRepository = manager.getRepository(BankSyncRun);
			const balanceRepository = manager.getRepository(BankAccountBalance);
			const bankTransactionRepository = manager.getRepository(BankTransaction);
			const bankAccountRepository = manager.getRepository(BankAccount);
			const observedAt = new Date();

			if (fetchResult.authoritativeAccountIds) {
				for (const bankAccount of fetchResult.knownAccounts) {
					const isActive = fetchResult.authoritativeAccountIds.has(bankAccount.providerAccountId);
					if (bankAccount.isActive === isActive) continue;

					await bankAccountRepository.update({id: bankAccount.id}, {isActive});
				}
			}

			for (const accountResult of fetchResult.accounts) {
				if (accountResult.balancesSucceeded && accountResult.balances.length > 0) {
					await balanceRepository.insert(
						accountResult.balances.map((balance) =>
							this.toBalanceValues(accountResult.bankAccount, run, balance, observedAt),
						),
					);
				}

				if (accountResult.transactionsSucceeded && accountResult.transactions.length > 0) {
					const transactionValues = accountResult.transactions.map((transaction) =>
						this.toBankTransactionValues(accountResult.bankAccount, transaction),
					);
					const insertResult = await bankTransactionRepository
						.createQueryBuilder()
						.insert()
						.into(BankTransaction)
						.values(transactionValues)
						.orIgnore()
						.returning('id')
						.execute();
					transactionsAdded += Array.isArray(insertResult.raw)
						? insertResult.raw.length
						: insertResult.raw
							? 1
							: 0;

					await bankTransactionRepository.upsert(transactionValues, ['bankAccountId', 'dedupeKey']);
				}

				if (accountResult.balancesSucceeded && accountResult.balances.length > 0) {
					const preferredBalance = selectPreferredBalance(accountResult.balances);
					if (preferredBalance) {
						await bankAccountRepository.update(
							{id: accountResult.bankAccount.id},
							{
								currentBalanceAmount: preferredBalance.amount,
								currentBalanceType: truncate(preferredBalance.balanceType, 32),
								balanceUpdatedAt: this.toDateTime(preferredBalance.lastChangeDateTime) ?? observedAt,
							},
						);
					}
				}
			}

			await runRepository.update(
				{id: run.id},
				{
					status,
					finishedAt,
					accountsFetched: fetchResult.accounts.filter(
						(account) => account.balancesSucceeded || account.transactionsSucceeded,
					).length,
					balancesFetched: fetchResult.accounts.reduce(
						(count, account) => count + (account.balancesSucceeded ? account.balances.length : 0),
						0,
					),
					transactionsFetched: fetchResult.accounts.reduce(
						(count, account) => count + (account.transactionsSucceeded ? account.transactions.length : 0),
						0,
					),
					errorMessage,
				},
			);

			await connectionRepository.update(
				{id: connection.id},
				{
					status: fetchResult.connectionExpired ? EXPIRED : connection.status,
					lastSyncedAt: status === SUCCEEDED || status === PARTIAL ? finishedAt : connection.lastSyncedAt,
					lastSyncError: errorMessage,
				},
			);
		});

		return transactionsAdded;
	}

	private async markPersistenceFailure(connectionId: string, runId: string): Promise<void> {
		await this.bankSyncRunRepository.update(
			{id: runId},
			{status: FAILED, finishedAt: new Date(), errorMessage: BANKING_PERSISTENCE_SYNC_ERROR},
		);
		await this.bankConnectionRepository.update({id: connectionId}, {lastSyncError: BANKING_PERSISTENCE_SYNC_ERROR});
	}

	private toBalanceValues(
		bankAccount: BankAccount,
		run: BankSyncRun,
		balance: EnableBankingBalance,
		observedAt: Date,
	) {
		return {
			bankAccountId: bankAccount.id,
			bankSyncRunId: run.id,
			name: truncate(balance.name, 255),
			balanceType: truncate(balance.balanceType, 32) ?? 'UNKNOWN',
			amount: balance.amount,
			currency: balance.currency.toUpperCase(),
			lastChangeDateTime: this.toDateTime(balance.lastChangeDateTime),
			referenceDate: this.toDateOnly(balance.referenceDate),
			lastCommittedTransaction: truncate(balance.lastCommittedTransaction, 255),
			observedAt,
		};
	}

	private toBankTransactionValues(bankAccount: BankAccount, transaction: EnableBankingTransaction) {
		const amount = this.toSignedAmount(transaction.amount, transaction.creditDebitIndicator);
		const currency = transaction.currency.toUpperCase();
		const description = truncate(transaction.description, 500);
		const counterpartyName = truncate(transaction.counterpartyName, 255);
		const displayDescription = getBankTransactionDisplayDescription({description, counterpartyName});
		const remittanceInformation = truncate(transaction.remittanceInformation, 10_000);
		const transactionDate = this.toDateOnly(transaction.transactionDate);
		const bookingDate = this.toDateOnly(transaction.bookingDate);
		const valueDate = this.toDateOnly(transaction.valueDate);
		const providerTransactionId = truncate(transaction.providerTransactionId, 255);
		const entryReference = truncate(transaction.entryReference, 255);
		const creditDebitIndicator = truncate(transaction.creditDebitIndicator, 8);
		const bankTransactionCode = truncate(transaction.bankTransactionCode, 64);
		const bankTransactionSubCode = truncate(transaction.bankTransactionSubCode, 64);
		const bankTransactionDescription = truncate(transaction.bankTransactionDescription, 255);
		const hasBalanceAfter = Boolean(transaction.balanceAfterAmount && transaction.balanceAfterCurrency);
		const hasInstructedAmount = Boolean(transaction.instructedAmount && transaction.instructedCurrency);
		const hasExchangeRate = Boolean(transaction.exchangeRate && transaction.exchangeRateUnitCurrency);

		return {
			bankAccountId: bankAccount.id,
			providerTransactionId,
			entryReference,
			dedupeKey: this.createDedupeKey({
				providerTransactionId,
				entryReference,
				bookingDate,
				valueDate,
				amount,
				currency,
				creditDebitIndicator,
				description,
				counterpartyName,
				remittanceInformation,
			}),
			transactionDate,
			bookingDate,
			valueDate,
			amount,
			currency,
			creditDebitIndicator,
			transactionType: normalizeBankTransactionType({
				code: bankTransactionCode ?? undefined,
				subCode: bankTransactionSubCode ?? undefined,
				description: bankTransactionDescription ?? undefined,
			}),
			transactionStatus: truncate(transaction.status, 32),
			bankTransactionCode,
			bankTransactionSubCode,
			bankTransactionDescription,
			description,
			displayDescription,
			counterpartyName,
			merchantCategoryCode: truncate(transaction.merchantCategoryCode, 16),
			remittanceInformation,
			balanceAfterAmount: hasBalanceAfter ? transaction.balanceAfterAmount : null,
			balanceAfterCurrency: hasBalanceAfter ? transaction.balanceAfterCurrency?.toUpperCase() : null,
			instructedAmount: hasInstructedAmount ? transaction.instructedAmount : null,
			instructedCurrency: hasInstructedAmount ? transaction.instructedCurrency?.toUpperCase() : null,
			exchangeRate: hasExchangeRate ? transaction.exchangeRate : null,
			exchangeRateUnitCurrency: hasExchangeRate ? transaction.exchangeRateUnitCurrency?.toUpperCase() : null,
			exchangeRateType: truncate(transaction.exchangeRateType, 16),
			referenceNumber: truncate(transaction.referenceNumber, 255),
			referenceNumberScheme: truncate(transaction.referenceNumberScheme, 32),
		};
	}

	private toSyncRunResponse(
		run: BankSyncRun,
		transactionsAdded: number,
		rateLimit?: SyncRateLimit,
	): BankSyncRunResponseDto {
		return {
			id: run.id,
			status: run.status,
			startedAt: run.startedAt,
			finishedAt: run.finishedAt,
			requestedFrom: run.requestedFrom,
			requestedTo: run.requestedTo,
			accountsFetched: run.accountsFetched,
			balancesFetched: run.balancesFetched,
			transactionsFetched: run.transactionsFetched,
			transactionsAdded,
			errorMessage: run.errorMessage,
			rateLimitSource: rateLimit?.source ?? null,
			retryAfterSeconds: rateLimit?.retryAfterSeconds ?? null,
		};
	}

	private toRateLimit(error: unknown): SyncRateLimit | undefined {
		if (!(error instanceof EnableBankingClientError) || error.providerStatus !== 429) return undefined;

		return {
			source: 'enable-banking',
			retryAfterSeconds: error.retryAfterSeconds ?? ENABLE_BANKING_BACKGROUND_RETRY_AFTER_SECONDS,
		};
	}

	private mergeRateLimit(
		current: SyncRateLimit | undefined,
		next: SyncRateLimit | undefined,
	): SyncRateLimit | undefined {
		if (!current) return next;
		if (!next || next.retryAfterSeconds <= current.retryAfterSeconds) return current;
		return next;
	}

	private createDedupeKey(values: Record<string, string | null>): string {
		const identity = values.providerTransactionId
			? `transaction:${values.providerTransactionId}`
			: values.entryReference
				? `entry:${values.entryReference}`
				: Object.entries(values)
						.map(([key, value]) => `${key}:${this.normalizeForHash(value)}`)
						.join('|');

		return createHash('sha256').update(identity).digest('hex');
	}

	private normalizeForHash(value: string | null): string {
		return value?.trim().toLowerCase() ?? '';
	}

	private toSignedAmount(amount: string, creditDebitIndicator?: string): string {
		const normalizedAmount = amount.trim();
		const isNegative = normalizedAmount.startsWith('-');
		const unsignedAmount = normalizedAmount.replace(/^[+-]/, '');

		if (creditDebitIndicator === 'DBIT' && !isNegative) return `-${unsignedAmount}`;
		if (creditDebitIndicator === 'CRDT' && isNegative) return unsignedAmount;
		return normalizedAmount;
	}

	private toDateTime(value: string | undefined): Date | null {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	private toDateOnly(value: Date | string | undefined): string | null {
		if (!value) return null;
		if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
			const date = new Date(`${value}T00:00:00.000Z`);
			return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
		}

		const date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
	}

	private subtractDays(value: string, days: number): string {
		const date = new Date(`${value}T00:00:00.000Z`);
		date.setUTCDate(date.getUTCDate() - days);
		return this.toDateOnly(date) as string;
	}

	private isExpiredSessionError(error: unknown): boolean {
		if (!(error instanceof EnableBankingClientError)) return false;
		const code = error.code.toLowerCase();
		return (
			error.providerStatus === 401 ||
			error.providerStatus === 403 ||
			code.includes('session') ||
			code.includes('consent') ||
			code.includes('revok') ||
			code.includes('expired')
		);
	}
}
