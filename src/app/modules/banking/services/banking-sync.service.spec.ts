import Redis from 'ioredis';
import {DataSource, Repository} from 'typeorm';

import {BANKING_SERVICE_UNAVAILABLE} from '../api/constants/banking-messages.constants';
import {BankAccountBalance} from '../bank-account-balance.entity';
import {BankAccount} from '../bank-account.entity';
import {BankConnection} from '../bank-connection.entity';
import {BankSyncRun} from '../bank-sync-run.entity';
import {BankTransaction} from '../bank-transaction.entity';
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
			bankTransaction: {upsert: jest.fn().mockResolvedValue(undefined)},
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
		const service = new BankingSyncService(
			bankConnectionRepositoryMock as unknown as Repository<BankConnection>,
			bankAccountRepositoryMock as unknown as Repository<BankAccount>,
			bankSyncRunRepositoryMock as unknown as Repository<BankSyncRun>,
			redisMock as unknown as Redis,
			dataSourceMock as unknown as DataSource,
			enableBankingClientMock as unknown as EnableBankingClient,
			encryptionServiceMock as unknown as BankingEncryptionService,
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
	let bankSyncRunRepository: {
		create: jest.Mock;
		save: jest.Mock;
		findOne: jest.Mock;
		findOneBy: jest.Mock;
		update: jest.Mock;
	};
	let transactionRepository: {
		insert: jest.Mock;
		upsert: jest.Mock;
		update: jest.Mock;
		createQueryBuilder: jest.Mock;
	};

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

		const bankConnectionRepository = {
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

		service = new BankingSyncService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			bankAccountRepository as unknown as Repository<BankAccount>,
			bankSyncRunRepository as unknown as Repository<BankSyncRun>,
			redis as unknown as Redis,
			dataSource as unknown as DataSource,
			enableBankingClient as unknown as EnableBankingClient,
			encryptionService as unknown as BankingEncryptionService,
		);
	});

	it('reports only transactions that were added during synchronization', async () => {
		const transactions = [
			{providerTransactionId: 'existing-transaction', amount: '10.00', currency: 'EUR'},
			{providerTransactionId: 'new-transaction', amount: '20.00', currency: 'EUR'},
		];
		const insertQueryBuilder = {
			insert: jest.fn().mockReturnThis(),
			into: jest.fn().mockReturnThis(),
			values: jest.fn().mockReturnThis(),
			orIgnore: jest.fn().mockReturnThis(),
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
