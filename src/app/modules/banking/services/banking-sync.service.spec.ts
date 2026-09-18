import Redis from 'ioredis';
import {DataSource, Repository} from 'typeorm';

import {BANKING_SERVICE_UNAVAILABLE} from '../api/constants/banking-messages.constants';
import {BankAccountBalance} from '../bank-account-balance.entity';
import {BankAccount} from '../bank-account.entity';
import {BankConnection} from '../bank-connection.entity';
import {BankSyncRun} from '../bank-sync-run.entity';
import {
	BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION,
	BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES,
	BANK_TRANSACTION_FINANCIAL_EVENT_TYPES,
} from '../bank-transaction-financial-event';
import {BankTransaction} from '../bank-transaction.entity';
import {BankTransactionCategorizationService} from '../categorization/bank-transaction-categorization.service';
import {BankingConnectionLockService} from './banking-connection-lock.service';
import {BankingEncryptionService} from './banking-encryption.service';
import {BankingSyncService} from './banking-sync.service';
import {EnableBankingClient} from './enable-banking.client';

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
};

function deferred<T>(): Deferred<T> {
	let resolve!: Deferred<T>['resolve'];
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return {promise, resolve};
}

describe('BankingSyncService', () => {
	it('does not lock an unauthorized connection while ownership is being resolved', async () => {
		const connection = {
			id: 'connection-id',
			status: 'AUTHORIZED',
			providerSessionId: 'encrypted-session',
			consentValidUntil: new Date(Date.now() + 60_000),
		} as BankConnection;
		const run = {
			id: 'run-id',
			status: 'RUNNING',
			requestedFrom: null,
			requestedTo: '2026-09-03',
			accountsFetched: 0,
			balancesFetched: 0,
			transactionsFetched: 0,
			errorMessage: null,
		} as BankSyncRun;
		const completedRun = {...run, status: 'SUCCEEDED', finishedAt: new Date()};
		const unauthorizedLookupStarted = deferred<void>();
		const releaseUnauthorizedLookup = deferred<void>();
		const locks = new Map<string, string>();

		const redisMock = {
			set: jest.fn((key: string, token: string) => {
				if (locks.has(key)) return Promise.resolve(null);
				locks.set(key, token);
				return Promise.resolve('OK');
			}),
			eval: jest.fn((_script: string, _keyCount: number, key: string, token: string) => {
				if (locks.get(key) === token) locks.delete(key);
				return Promise.resolve(1);
			}),
		};
		const bankConnectionRepositoryMock = {
			findOne: jest.fn(),
			update: jest.fn().mockResolvedValue(undefined),
		};
		const bankAccountRepositoryMock = {
			find: jest.fn().mockResolvedValue([]),
		};
		const bankSyncRunRepositoryMock = {
			findOne: jest.fn().mockResolvedValue(null),
			create: jest.fn().mockReturnValue(run),
			save: jest.fn().mockResolvedValue(run),
			findOneBy: jest.fn().mockResolvedValue(completedRun),
			update: jest.fn().mockResolvedValue(undefined),
		};
		const persistenceRepositories = {
			bankConnection: {update: jest.fn().mockResolvedValue(undefined)},
			bankSyncRun: {update: jest.fn().mockResolvedValue(undefined)},
			balance: {insert: jest.fn().mockResolvedValue(undefined)},
			bankTransaction: {
				find: jest.fn().mockResolvedValue([]),
				upsert: jest.fn().mockResolvedValue(undefined),
			},
			bankAccount: {update: jest.fn().mockResolvedValue(undefined)},
		};
		const transactionManager = {
			getRepository: jest.fn((entity: unknown) => {
				if (entity === BankConnection) return persistenceRepositories.bankConnection;
				if (entity === BankSyncRun) return persistenceRepositories.bankSyncRun;
				if (entity === BankAccountBalance) return persistenceRepositories.balance;
				if (entity === BankTransaction) return persistenceRepositories.bankTransaction;
				return persistenceRepositories.bankAccount;
			}),
		};
		const dataSourceMock = {
			transaction: jest.fn(),
		};
		dataSourceMock.transaction.mockImplementation(
			async (callback: (manager: typeof transactionManager) => unknown) => callback(transactionManager),
		);
		const enableBankingClientMock = {
			getSessionAccounts: jest.fn().mockResolvedValue({status: 'AUTHORIZED', accountIds: []}),
		};
		const encryptionServiceMock = {
			decrypt: jest.fn().mockReturnValue('provider-session'),
		};
		const categorizationServiceMock = {
			enqueueForTransactions: jest.fn().mockResolvedValue(undefined),
		};
		const service = new BankingSyncService(
			bankConnectionRepositoryMock as unknown as Repository<BankConnection>,
			bankAccountRepositoryMock as unknown as Repository<BankAccount>,
			bankSyncRunRepositoryMock as unknown as Repository<BankSyncRun>,
			dataSourceMock as unknown as DataSource,
			enableBankingClientMock as unknown as EnableBankingClient,
			encryptionServiceMock as unknown as BankingEncryptionService,
			new BankingConnectionLockService(redisMock as unknown as Redis),
			categorizationServiceMock as unknown as BankTransactionCategorizationService,
		);

		bankConnectionRepositoryMock.findOne.mockImplementation(async (options: {where: {account: {id: string}}}) => {
			if (options.where.account.id === 'attacker-account-id') {
				unauthorizedLookupStarted.resolve();
				await releaseUnauthorizedLookup.promise;
				return null;
			}
			return connection;
		});

		const unauthorizedSync = service.synchronize('attacker-account-id', connection.id);
		await unauthorizedLookupStarted.promise;

		expect(redisMock.set).not.toHaveBeenCalled();

		await expect(service.synchronize('owner-account-id', connection.id)).resolves.toMatchObject({
			status: 'SUCCEEDED',
		});

		releaseUnauthorizedLookup.resolve();
		await expect(unauthorizedSync).rejects.toMatchObject({status: 404});
		expect(redisMock.set).toHaveBeenCalledTimes(1);
		expect(redisMock.eval).toHaveBeenCalledTimes(1);
		expect(locks.size).toBe(0);
	});
});

type LockOwner = {
	token: string;
	expiresAt: number;
};

describe('BankingSyncService synchronization lock', () => {
	let service: BankingSyncService;
	let redis: {
		set: jest.Mock;
		eval: jest.Mock;
	};
	let transactionGate: Deferred<[]>;
	let lockOwner: LockOwner | undefined;
	let renewalShouldFail: boolean;
	let enableBankingClient: {
		getSessionAccounts: jest.Mock;
		getAccountBalances: jest.Mock;
		getAccountTransactions: jest.Mock;
	};
	let bankConnectionRepository: {
		findOne: jest.Mock;
		update: jest.Mock;
	};
	let bankSyncRunRepository: {
		create: jest.Mock;
		save: jest.Mock;
		findOne: jest.Mock;
		findOneBy: jest.Mock;
		update: jest.Mock;
	};
	type TransactionRepository = {
		find: jest.Mock;
		insert: jest.Mock;
		upsert: jest.Mock;
		update: jest.Mock;
		createQueryBuilder: jest.Mock;
	};
	let transactionRepository: TransactionRepository;

	beforeEach(() => {
		jest.useFakeTimers();
		transactionGate = deferred<[]>();
		lockOwner = undefined;
		renewalShouldFail = false;
		redis = {
			set: jest.fn(async (_key: string, token: string, _expiration: string, ttl: number) => {
				if (lockOwner && lockOwner.expiresAt <= Date.now()) lockOwner = undefined;
				if (lockOwner) return null;
				lockOwner = {token, expiresAt: Date.now() + ttl * 1000};
				return 'OK';
			}),
			eval: jest.fn(async (script: string, _keyCount: number, _key: string, token: string, ttl?: number) => {
				if (script.includes('expire')) {
					if (renewalShouldFail) return 0;
					if (lockOwner?.token !== token || lockOwner.expiresAt <= Date.now()) return 0;
					lockOwner.expiresAt = Date.now() + (ttl ?? 0) * 1000;
					return 1;
				}

				if (lockOwner?.token !== token) return 0;
				lockOwner = undefined;
				return 1;
			}),
		};

		const connection = {
			id: 'connection-id',
			status: 'AUTHORIZED',
			providerSessionId: 'encrypted-session',
			consentValidUntil: new Date(Date.now() + 60 * 60 * 1000),
			lastSyncedAt: null,
			lastSyncError: null,
		} as unknown as BankConnection;
		const bankAccount = {
			id: 'bank-account-id',
			providerAccountId: 'provider-account-id',
		} as unknown as BankAccount;
		const run = {
			id: 'run-id',
			startedAt: new Date(),
			requestedFrom: null,
			requestedTo: '2026-09-03',
			status: 'RUNNING',
		} as unknown as BankSyncRun;
		const completedRun = {
			...run,
			status: 'SUCCEEDED',
			finishedAt: new Date(),
			accountsFetched: 1,
			balancesFetched: 0,
			transactionsFetched: 0,
			errorMessage: null,
		} as unknown as BankSyncRun;

		bankConnectionRepository = {
			findOne: jest.fn().mockResolvedValue(connection),
			update: jest.fn().mockResolvedValue(undefined),
		};
		const bankAccountRepository = {
			find: jest.fn().mockResolvedValue([bankAccount]),
			update: jest.fn().mockResolvedValue(undefined),
		};
		bankSyncRunRepository = {
			create: jest.fn().mockReturnValue(run),
			save: jest.fn().mockResolvedValue(run),
			findOne: jest.fn().mockResolvedValue(null),
			findOneBy: jest.fn().mockResolvedValue(completedRun),
			update: jest.fn().mockResolvedValue(undefined),
		};
		transactionRepository = {
			find: jest.fn().mockResolvedValue([]),
			insert: jest.fn().mockResolvedValue(undefined),
			upsert: jest.fn().mockResolvedValue(undefined),
			update: jest.fn().mockResolvedValue(undefined),
			createQueryBuilder: jest.fn(),
		};
		const dataSource = {
			transaction: jest.fn(async (callback: (manager: unknown) => Promise<void>) =>
				callback({getRepository: jest.fn().mockReturnValue(transactionRepository)}),
			),
		};
		enableBankingClient = {
			getSessionAccounts: jest
				.fn()
				.mockResolvedValue({status: 'AUTHORIZED', accountIds: ['provider-account-id']}),
			getAccountBalances: jest.fn().mockResolvedValue([]),
			getAccountTransactions: jest.fn().mockImplementation(() => transactionGate.promise),
		};
		const encryptionService = {
			decrypt: jest.fn().mockReturnValue('provider-session'),
		};
		const categorizationService = {
			enqueueForTransactions: jest.fn().mockResolvedValue(undefined),
		};

		service = new BankingSyncService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			bankAccountRepository as unknown as Repository<BankAccount>,
			bankSyncRunRepository as unknown as Repository<BankSyncRun>,
			dataSource as unknown as DataSource,
			enableBankingClient as unknown as EnableBankingClient,
			encryptionService as unknown as BankingEncryptionService,
			new BankingConnectionLockService(redis as unknown as Redis),
			categorizationService as unknown as BankTransactionCategorizationService,
		);
	});

	it('rechecks the connection after acquiring the lock', async () => {
		bankConnectionRepository.findOne
			.mockReset()
			.mockResolvedValueOnce({
				id: 'connection-id',
				status: 'AUTHORIZED',
				providerSessionId: 'encrypted-session',
				consentValidUntil: new Date(Date.now() + 60 * 60 * 1000),
			} as BankConnection)
			.mockResolvedValueOnce(null);
		enableBankingClient.getAccountTransactions.mockResolvedValueOnce([]);

		await expect(service.synchronize('account-id', 'connection-id')).rejects.toMatchObject({status: 404});
		expect(enableBankingClient.getSessionAccounts).not.toHaveBeenCalled();
	});

	it('reports only transactions that were added during synchronization', async () => {
		const transactions = [
			{
				providerTransactionId: 'existing-transaction',
				amount: '10.00',
				currency: 'EUR',
				counterpartyLocation: {
					city: 'Exampletown',
					region: 'Example Region',
					country: 'NL',
					streetName: 'Private Street',
				},
			},
			{providerTransactionId: 'new-transaction', amount: '20.00', currency: 'EUR'},
		];
		const insertQueryBuilder = {
			insert: jest.fn().mockReturnThis(),
			into: jest.fn().mockReturnThis(),
			values: jest.fn().mockReturnThis(),
			orIgnore: jest.fn().mockReturnThis(),
			orUpdate: jest.fn().mockReturnThis(),
			returning: jest.fn().mockReturnThis(),
			execute: jest.fn().mockResolvedValue({raw: [{id: 'new-transaction-id'}]}),
		};
		transactionRepository.createQueryBuilder.mockReturnValue(insertQueryBuilder);
		enableBankingClient.getAccountTransactions.mockResolvedValue(transactions);
		bankSyncRunRepository.findOneBy.mockResolvedValue({
			id: 'run-id',
			status: 'SUCCEEDED',
			startedAt: new Date(),
			finishedAt: new Date(),
			requestedFrom: null,
			requestedTo: '2026-09-09',
			accountsFetched: 1,
			balancesFetched: 0,
			transactionsFetched: 2,
			errorMessage: null,
		} as unknown as BankSyncRun);

		await expect(service.synchronize('account-id', 'connection-id')).resolves.toMatchObject({
			status: 'SUCCEEDED',
			transactionsFetched: 2,
			transactionsAdded: 1,
		});
		expect(insertQueryBuilder.orIgnore).toHaveBeenCalledTimes(1);
		expect(insertQueryBuilder.returning).toHaveBeenCalledWith('id');
		expect(insertQueryBuilder.values).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					merchantLocation: {city: 'Exampletown', region: 'Example Region', country: 'NL'},
				}),
			]),
		);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('renews a long-running lock so a second synchronization cannot overlap', async () => {
		const firstSync = service.synchronize('account-id', 'connection-id');
		await jest.advanceTimersByTimeAsync(0);
		expect(redis.set).toHaveBeenCalledTimes(1);

		await jest.advanceTimersByTimeAsync(15 * 60 * 1000 + 1);
		const secondSync = service.synchronize('account-id', 'connection-id');
		const secondSyncResult = expect(secondSync).rejects.toThrow('A bank synchronization is already in progress.');
		await jest.advanceTimersByTimeAsync(0);

		transactionGate.resolve([]);

		await secondSyncResult;
		await expect(firstSync).resolves.toEqual(
			expect.objectContaining({
				id: 'run-id',
				status: 'SUCCEEDED',
			}),
		);
		expect(redis.eval.mock.calls.some(([script]) => String(script).includes('expire'))).toBe(true);
	});

	it('cancels the synchronization when renewal loses lock ownership', async () => {
		const firstSync = service.synchronize('account-id', 'connection-id');
		const firstSyncResult = expect(firstSync).rejects.toThrow(BANKING_SERVICE_UNAVAILABLE);
		await jest.advanceTimersByTimeAsync(0);

		const requestSignal = enableBankingClient.getAccountTransactions.mock.calls[0][2] as AbortSignal;
		renewalShouldFail = true;
		await jest.advanceTimersByTimeAsync((15 * 60 * 1000) / 3 + 1);

		expect(requestSignal.aborted).toBe(true);
		lockOwner = {token: 'new-owner', expiresAt: Date.now() + 15 * 60 * 1000};
		transactionGate.resolve([]);

		await firstSyncResult;
		expect(lockOwner.token).toBe('new-owner');
	});
});

describe('BankingSyncService transaction event persistence', () => {
	function createServiceForTransactionValues(): BankingSyncService {
		return new BankingSyncService(
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);
	}

	function toBankTransactionValues(
		service: BankingSyncService,
		transaction: Record<string, unknown>,
		bankAccount: Record<string, unknown>,
		provider = 'enable-banking',
		aspspName = 'Revolut',
	): Record<string, unknown> {
		return (
			service as unknown as {
				toBankTransactionValues: (...args: unknown[]) => Record<string, unknown>;
			}
		).toBankTransactionValues(bankAccount, transaction, aspspName, provider);
	}

	it('stores currency exchange metadata and skips the categorization input hash', () => {
		const service = createServiceForTransactionValues();
		const values = toBankTransactionValues(
			service,
			{
				id: 'provider-transaction-id',
				amount: '10.00',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				description: ' Exchanged   to GBP ',
			},
			{id: 'bank-account-id', currency: 'EUR'},
		);

		expect(values).toMatchObject({
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.RULE,
			financialEventRuleVersion: BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION,
			categoryInputHash: null,
		});
	});

	it('keeps an existing non-manual exchange row out of categorization after reclassification', async () => {
		const service = createServiceForTransactionValues();
		const insertQueryBuilder = {
			insert: jest.fn().mockReturnThis(),
			into: jest.fn().mockReturnThis(),
			values: jest.fn().mockReturnThis(),
			orIgnore: jest.fn().mockReturnThis(),
			orUpdate: jest.fn().mockReturnThis(),
			returning: jest.fn().mockReturnThis(),
			execute: jest.fn().mockResolvedValue({raw: []}),
		};
		const eventUpdateQueryBuilder = {
			update: jest.fn().mockReturnThis(),
			set: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			execute: jest.fn().mockResolvedValue({affected: 1}),
		};
		const repositoryFind = jest.fn();
		const repository = {
			find: repositoryFind,
			createQueryBuilder: jest
				.fn()
				.mockReturnValueOnce(insertQueryBuilder)
				.mockReturnValueOnce(insertQueryBuilder)
				.mockReturnValueOnce(eventUpdateQueryBuilder),
			upsert: jest.fn().mockResolvedValue(undefined),
		} as unknown as Repository<BankTransaction>;
		const bankAccount = {id: 'bank-account-id', currency: 'EUR'} as BankAccount;
		const transaction = {
			id: 'provider-transaction-id',
			providerTransactionId: 'provider-transaction-id',
			amount: '10.00',
			currency: 'EUR',
			creditDebitIndicator: 'DBIT',
			description: 'Exchanged to GBP',
		};
		const mappedValue = toBankTransactionValues(
			service,
			transaction,
			bankAccount as unknown as Record<string, unknown>,
		);
		repositoryFind
			.mockResolvedValueOnce([
				{
					id: 'existing-transaction-id',
					dedupeKey: mappedValue.dedupeKey,
					categoryInputHash: 'legacy-input-hash',
					categorySource: null,
				},
			])
			.mockResolvedValueOnce([{id: 'existing-transaction-id'}]);

		await (
			service as unknown as {
				persistTransactions: (...args: unknown[]) => Promise<unknown>;
			}
		).persistTransactions(repository, bankAccount, [transaction], 'Revolut', 'enable-banking');

		expect(insertQueryBuilder.orUpdate).toHaveBeenCalledWith(
			expect.any(Array),
			['bankAccountId', 'dedupeKey'],
			expect.objectContaining({
				overwriteCondition: expect.objectContaining({
					where: '"bank_transactions"."categoryStatus" IS DISTINCT FROM :processingStatus',
				}),
			}),
		);
		expect(repository.upsert).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE}),
			]),
			['bankAccountId', 'dedupeKey'],
		);
		expect(eventUpdateQueryBuilder.set).toHaveBeenCalledWith(
			expect.objectContaining({categoryStatus: 'NOT_APPLICABLE', categoryInputHash: null}),
		);
		expect(repository.createQueryBuilder).toHaveBeenCalledTimes(3);
	});

	it('does not classify an ordinary card payment that contains exchange metadata', () => {
		const service = createServiceForTransactionValues();
		const values = toBankTransactionValues(
			service,
			{
				id: 'provider-card-payment-id',
				amount: '10.00',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				description: 'Card payment',
				exchangeRate: '1.12',
				exchangeRateUnitCurrency: 'USD',
			},
			{id: 'bank-account-id', currency: 'EUR'},
		);

		expect(values.financialEventType).toBeNull();
		expect(values.categoryInputHash).toEqual(expect.any(String));
	});
});
