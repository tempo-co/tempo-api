import {faker} from '@faker-js/faker';
import {jest} from '@jest/globals';
import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import Redis from 'ioredis';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import {Repository} from 'typeorm';

import {REDIS} from '@core/redis/redis.constants';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';
import {BankAccountBalance} from '@modules/banking/bank-account-balance.entity';
import {BankAccount} from '@modules/banking/bank-account.entity';
import {BankConnection} from '@modules/banking/bank-connection.entity';
import {BankSyncRun} from '@modules/banking/bank-sync-run.entity';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';
import {EnableBankingBalance, EnableBankingTransaction} from '@modules/banking/enable-banking.types';
import {BankingEncryptionService} from '@modules/banking/services/banking-encryption.service';
import {EnableBankingClient, EnableBankingClientError} from '@modules/banking/services/enable-banking.client';

import {
	SESSION_TEST_ACCOUNT_EMAIL,
	SESSION_TEST_ACCOUNT_PASSWORD,
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../../scripts/seed-data/seed.constants';
import {getApp} from '../../setup/e2e.setup';

describe('BankConnectionController', () => {
	let app: INestApplication;
	let httpServer: Server;
	let verifiedAgent: TestAgent;
	let unverifiedAgent: TestAgent;
	let otherVerifiedAgent: TestAgent;
	let account: Account;
	let bankConnectionRepository: Repository<BankConnection>;
	let bankAccountRepository: Repository<BankAccount>;
	let bankSyncRunRepository: Repository<BankSyncRun>;
	let bankAccountBalanceRepository: Repository<BankAccountBalance>;
	let bankTransactionRepository: Repository<BankTransaction>;
	let redis: Redis;
	let enableBankingClient: EnableBankingClient;
	let getAspsps: jest.SpiedFunction<EnableBankingClient['getAspsps']>;
	let startAuthorization: jest.SpiedFunction<EnableBankingClient['startAuthorization']>;
	let createSession: jest.SpiedFunction<EnableBankingClient['createSession']>;
	let getSessionAccounts: jest.SpiedFunction<EnableBankingClient['getSessionAccounts']>;
	let getAccountBalances: jest.SpiedFunction<EnableBankingClient['getAccountBalances']>;
	let getAccountTransactions: jest.SpiedFunction<EnableBankingClient['getAccountTransactions']>;
	const sessionAccountIdsBySession = new Map<string, string[]>();

	beforeAll(async () => {
		app = getApp();
		httpServer = app.getHttpServer();
		const seededAccount = await app.get(AccountService).findByEmail(VERIFIED_ACCOUNT_EMAIL);
		if (!seededAccount) throw new Error('Test account was not seeded.');
		account = seededAccount;

		bankConnectionRepository = app.get<Repository<BankConnection>>(getRepositoryToken(BankConnection));
		bankAccountRepository = app.get<Repository<BankAccount>>(getRepositoryToken(BankAccount));
		bankSyncRunRepository = app.get<Repository<BankSyncRun>>(getRepositoryToken(BankSyncRun));
		bankAccountBalanceRepository = app.get<Repository<BankAccountBalance>>(getRepositoryToken(BankAccountBalance));
		bankTransactionRepository = app.get<Repository<BankTransaction>>(getRepositoryToken(BankTransaction));
		redis = app.get<Redis>(REDIS);
		enableBankingClient = app.get(EnableBankingClient);
		getAspsps = jest.spyOn(enableBankingClient, 'getAspsps');
		startAuthorization = jest.spyOn(enableBankingClient, 'startAuthorization');
		createSession = jest.spyOn(enableBankingClient, 'createSession');
		getSessionAccounts = jest.spyOn(enableBankingClient, 'getSessionAccounts');
		getSessionAccounts.mockImplementation(async (sessionId) => ({
			status: 'AUTHORIZED',
			accountIds: sessionAccountIdsBySession.get(sessionId) ?? [],
		}));
		getAccountBalances = jest.spyOn(enableBankingClient, 'getAccountBalances');
		getAccountTransactions = jest.spyOn(enableBankingClient, 'getAccountTransactions');

		getAspsps.mockResolvedValue([
			{
				name: 'ABN AMRO',
				country: 'NL',
				maximumConsentValiditySeconds: 60 * 60 * 24 * 90,
			},
		]);
		startAuthorization.mockResolvedValue({
			url: 'https://auth.example.test/authorize',
			authorizationId: faker.string.uuid(),
		});

		verifiedAgent = request.agent(httpServer);
		await verifiedAgent
			.post('/auth/login')
			.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
			.expect(200);

		unverifiedAgent = request.agent(httpServer);
		await unverifiedAgent
			.post('/auth/login')
			.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
			.expect(200);

		otherVerifiedAgent = request.agent(httpServer);
		await otherVerifiedAgent
			.post('/auth/login')
			.send({email: SESSION_TEST_ACCOUNT_EMAIL, password: SESSION_TEST_ACCOUNT_PASSWORD})
			.expect(200);

		await bankConnectionRepository
			.createQueryBuilder()
			.delete()
			.where('accountId = :accountId', {accountId: account.id})
			.execute();
	});

	afterAll(async () => {
		await bankConnectionRepository
			.createQueryBuilder()
			.delete()
			.where('accountId = :accountId', {accountId: account.id})
			.execute();
		jest.restoreAllMocks();
	});

	it('requires an authenticated, verified account to start authorization', async () => {
		await request(httpServer)
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(401);

		await unverifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(403);
	});

	it('requires an authenticated, verified account to list connections', async () => {
		await request(httpServer).get('/bank-connections').expect(401);
		await unverifiedAgent.get('/bank-connections').expect(403);
	});

	it('validates the requested ASPSP', async () => {
		await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NLD'})
			.expect(400);

		getAspsps.mockResolvedValueOnce([]);
		await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'Unknown Bank', aspspCountry: 'NL'})
			.expect(400);
	});

	it('persists a successful authorization without exposing sensitive provider values', async () => {
		const sessionId = 'provider-session-success';
		createSession.mockResolvedValueOnce({
			sessionId,
			consentValidUntil: '2030-01-01T00:00:00.000Z',
			aspsp: {name: 'ABN AMRO', country: 'NL'},
			accounts: [
				{
					uid: 'provider-account-success',
					identificationHash: 'stable-account-hash-success',
					name: 'Joe',
					details: 'Main account',
					currency: 'eur',
					cashAccountType: 'CACC',
					usage: 'PRIV',
				},
			],
		});

		const authorizationResponse = await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(201);
		const state = startAuthorization.mock.calls.at(-1)?.[0].state;
		expect(authorizationResponse.body).toEqual({authorizationUrl: 'https://auth.example.test/authorize'});
		expect(state).toEqual(expect.any(String));

		await request(httpServer)
			.get('/bank-connections/callback')
			.query({state, code: 'one-time-provider-code'})
			.expect(302)
			.expect('Location', 'http://localhost:5173/bank-connections?result=connected');

		const connection = await bankConnectionRepository.findOne({
			where: {account: {id: account.id}},
			order: {createdAt: 'DESC'},
		});
		if (!connection) throw new Error('Bank connection was not persisted.');
		const bankAccount = await bankAccountRepository.findOne({
			where: {bankConnection: {id: connection.id}},
		});

		expect(connection.status).toBe('AUTHORIZED');
		expect(connection.providerSessionId).toBeDefined();
		expect(connection.providerSessionId).not.toBe(sessionId);
		expect(bankAccount).toMatchObject({
			providerAccountId: 'provider-account-success',
			identificationHash: 'stable-account-hash-success',
			currency: 'EUR',
			name: 'Joe',
			details: 'Main account',
		});
		expect(bankAccount?.currentBalanceAmount).toBeNull();

		const response = await verifiedAgent.get('/bank-connections').expect(200);
		expect(response.body).toEqual([
			expect.objectContaining({
				id: connection.id,
				status: 'AUTHORIZED',
				bankAccounts: [
					expect.objectContaining({
						name: 'Joe',
						currency: 'EUR',
					}),
				],
			}),
		]);
		expect(JSON.stringify(response.body)).not.toContain('providerSessionId');
		expect(JSON.stringify(response.body)).not.toContain('stable-account-hash-success');
		expect(JSON.stringify(response.body)).not.toContain('provider-account-success');
	});

	it('handles cancellation and prevents callback replay', async () => {
		await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(201);
		const cancelledState = startAuthorization.mock.calls.at(-1)?.[0].state;

		await request(httpServer)
			.get('/bank-connections/callback')
			.query({state: cancelledState, error: 'access_denied', error_description: 'do not persist this'})
			.expect(302)
			.expect('Location', 'http://localhost:5173/bank-connections?result=cancelled');

		const cancelledConnection = await bankConnectionRepository.findOne({
			where: {account: {id: account.id}},
			order: {createdAt: 'DESC'},
		});
		expect(cancelledConnection?.status).toBe('CANCELLED');

		const successfulResponse = await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(201);
		const successfulState = startAuthorization.mock.calls.at(-1)?.[0].state;
		createSession.mockResolvedValueOnce({
			sessionId: 'provider-session-replay-test',
			consentValidUntil: '2030-01-01T00:00:00.000Z',
			aspsp: {name: 'ABN AMRO', country: 'NL'},
			accounts: [],
		});

		await request(httpServer)
			.get('/bank-connections/callback')
			.query({state: successfulState, code: 'replay-test-code'})
			.expect(302)
			.expect('Location', 'http://localhost:5173/bank-connections?result=connected');

		const successfulConnection = await bankConnectionRepository.findOne({
			where: {account: {id: account.id}},
			order: {createdAt: 'DESC'},
		});
		if (!successfulConnection) throw new Error('Successful authorization connection was not persisted.');
		const encryptedProviderSessionId = successfulConnection.providerSessionId;

		await request(httpServer)
			.get('/bank-connections/callback')
			.query({state: successfulState, code: 'replay-test-code'})
			.expect(302)
			.expect('Location', 'http://localhost:5173/bank-connections?result=error');
		expect(successfulResponse.body).toEqual({authorizationUrl: 'https://auth.example.test/authorize'});

		const replayedConnection = await bankConnectionRepository.findOneBy({id: successfulConnection.id});
		expect(replayedConnection).toMatchObject({
			status: 'AUTHORIZED',
			providerSessionId: encryptedProviderSessionId,
			authorizationStateHash: null,
		});
	});

	it('rejects an expired authorization state', async () => {
		await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(201);
		const state = startAuthorization.mock.calls.at(-1)?.[0].state;

		await redis.expire(`banking:authorization:${state}`, 1);
		await new Promise((resolve) => setTimeout(resolve, 1100));

		await request(httpServer)
			.get('/bank-connections/callback')
			.query({state, code: 'expired-provider-code'})
			.expect(302)
			.expect('Location', 'http://localhost:5173/bank-connections?result=error');
		expect(createSession).not.toHaveBeenCalledWith('expired-provider-code');

		const expiredConnection = await bankConnectionRepository.findOne({
			where: {account: {id: account.id}},
			order: {createdAt: 'DESC'},
		});
		expect(expiredConnection?.status).toBe('FAILED');
	});

	it('marks provider failures as failed without leaking provider details', async () => {
		await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(201);
		const state = startAuthorization.mock.calls.at(-1)?.[0].state;
		createSession.mockRejectedValueOnce(new EnableBankingClientError('secret-provider-error'));

		await request(httpServer)
			.get('/bank-connections/callback')
			.query({state, code: 'provider-failure-code'})
			.expect(302)
			.expect('Location', 'http://localhost:5173/bank-connections?result=error');

		const connection = await bankConnectionRepository.findOne({
			where: {account: {id: account.id}},
			order: {createdAt: 'DESC'},
		});
		expect(connection?.status).toBe('FAILED');
	});

	it('rolls back the connection transaction when bank-account persistence fails', async () => {
		await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(201);
		const state = startAuthorization.mock.calls.at(-1)?.[0].state;
		createSession.mockResolvedValueOnce({
			sessionId: 'provider-session-rollback-test',
			consentValidUntil: '2030-01-01T00:00:00.000Z',
			aspsp: {name: 'ABN AMRO', country: 'NL'},
			accounts: [
				{
					uid: 'provider-account-before-failure',
					identificationHash: 'stable-account-before-failure',
					currency: 'EUR',
				},
				{
					uid: 'provider-account-invalid',
					identificationHash: 'stable-account-invalid',
					currency: 'USDD',
				},
			],
		});

		await request(httpServer)
			.get('/bank-connections/callback')
			.query({state, code: 'rollback-test-code'})
			.expect(302)
			.expect('Location', 'http://localhost:5173/bank-connections?result=error');

		const connection = await bankConnectionRepository.findOne({
			where: {account: {id: account.id}},
			order: {createdAt: 'DESC'},
		});
		if (!connection) throw new Error('Bank connection was not persisted.');

		expect(connection.status).toBe('FAILED');
		expect(connection.providerSessionId).toBeNull();
		expect(await bankAccountRepository.count({where: {bankConnection: {id: connection.id}}})).toBe(0);
	});

	it('retains separate session account IDs and hashes across re-authorization', async () => {
		await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(201);
		const firstState = startAuthorization.mock.calls.at(-1)?.[0].state;
		const firstConnection = (
			await bankConnectionRepository.find({
				where: {account: {id: account.id}},
				order: {createdAt: 'DESC'},
			})
		)[0];

		await verifiedAgent
			.post('/bank-connections/authorize')
			.send({aspspName: 'ABN AMRO', aspspCountry: 'NL'})
			.expect(201);
		const secondState = startAuthorization.mock.calls.at(-1)?.[0].state;
		const secondConnection = (
			await bankConnectionRepository.find({
				where: {account: {id: account.id}},
				order: {createdAt: 'DESC'},
			})
		)[0];

		if (!firstConnection || !secondConnection) {
			throw new Error('Expected both authorization connections to be persisted');
		}

		createSession
			.mockResolvedValueOnce({
				sessionId: 'provider-session-first-reauthorization',
				consentValidUntil: '2030-01-01T00:00:00.000Z',
				aspsp: {name: 'ABN AMRO', country: 'NL'},
				accounts: [
					{
						uid: 'provider-account-first-reauthorization',
						identificationHash: 'stable-account-reauthorization',
						currency: 'EUR',
					},
				],
			})
			.mockResolvedValueOnce({
				sessionId: 'provider-session-second-reauthorization',
				consentValidUntil: '2030-01-01T00:00:00.000Z',
				aspsp: {name: 'ABN AMRO', country: 'NL'},
				accounts: [
					{
						uid: 'provider-account-second-reauthorization',
						identificationHash: 'stable-account-reauthorization',
						currency: 'EUR',
					},
				],
			});

		await request(httpServer)
			.get('/bank-connections/callback')
			.query({state: firstState, code: 'first-reauthorization-code'})
			.expect(302);
		await request(httpServer)
			.get('/bank-connections/callback')
			.query({state: secondState, code: 'second-reauthorization-code'})
			.expect(302);

		const connections = await bankConnectionRepository.find({
			where: {account: {id: account.id}},
			order: {createdAt: 'DESC'},
		});
		expect(connections).toEqual(
			expect.arrayContaining([
				expect.objectContaining({id: firstConnection.id, status: 'AUTHORIZED'}),
				expect.objectContaining({id: secondConnection.id, status: 'AUTHORIZED'}),
			]),
		);

		const firstBankAccount = await bankAccountRepository.findOne({
			where: {bankConnection: {id: firstConnection.id}},
		});
		const secondBankAccount = await bankAccountRepository.findOne({
			where: {bankConnection: {id: secondConnection.id}},
		});
		expect(firstBankAccount).toMatchObject({
			providerAccountId: 'provider-account-first-reauthorization',
			identificationHash: 'stable-account-reauthorization',
		});
		expect(secondBankAccount).toMatchObject({
			providerAccountId: 'provider-account-second-reauthorization',
			identificationHash: 'stable-account-reauthorization',
		});
	});

	it('does not expose one account owner’s connections to another account', async () => {
		const response = await otherVerifiedAgent.get('/bank-connections').expect(200);
		expect(response.body).toEqual([]);
	});

	it('enforces authentication, verification, ownership, and UUID validation for transaction reads', async () => {
		const {connection} = await createAuthorizedConnection('transaction-access-check');
		const transactionPath = `/bank-connections/${connection.id}/transactions`;

		await request(httpServer).get(transactionPath).expect(401);
		await unverifiedAgent.get(transactionPath).expect(403);
		await otherVerifiedAgent.get(transactionPath).expect(404);
		await verifiedAgent.get('/bank-connections/not-a-uuid/transactions').expect(400);
	});

	it('synchronizes balances and transactions without exposing provider identifiers', async () => {
		const {connection, bankAccount} = await createAuthorizedConnection('sync-provider-session');
		const balances = makeBalances();
		const transactions = makeTransactions('sync');
		getAccountBalances.mockResolvedValueOnce(balances);
		getAccountTransactions.mockResolvedValueOnce(transactions);

		const firstResponse = await verifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(200);
		expect(firstResponse.body).toEqual(
			expect.objectContaining({
				status: 'SUCCEEDED',
				requestedFrom: null,
				accountsFetched: 1,
				balancesFetched: 2,
				transactionsFetched: 5,
			}),
		);

		const persistedBalances = await bankAccountBalanceRepository.find({
			where: {bankAccountId: bankAccount.id},
			order: {balanceType: 'ASC'},
		});
		expect(persistedBalances).toHaveLength(2);

		const persistedTransactions = await bankTransactionRepository.find({
			where: {bankAccountId: bankAccount.id},
		});
		expect(persistedTransactions).toHaveLength(5);
		expect(persistedTransactions.find(({creditDebitIndicator}) => creditDebitIndicator === 'DBIT')?.amount).toBe(
			'-12.50000000',
		);
		expect(
			persistedTransactions.find(
				({providerTransactionId}) => providerTransactionId === 'provider-transaction-sync-0',
			),
		).toMatchObject({
			transactionDate: '2026-08-24',
			transactionType: 'CARD_PAYMENT',
			bankTransactionCode: 'PMNT',
			bankTransactionSubCode: 'CARD',
			bankTransactionDescription: 'Card payment',
			balanceAfterAmount: '110.95000000',
			balanceAfterCurrency: 'EUR',
			instructedAmount: '12.00000000',
			instructedCurrency: 'USD',
			exchangeRate: '0.923400000000000000',
			exchangeRateUnitCurrency: 'USD',
			exchangeRateType: 'SPOT',
			referenceNumber: 'reference-sync-0',
			referenceNumberScheme: 'RF',
		});

		const refreshedAccount = await bankAccountRepository.findOneBy({id: bankAccount.id});
		expect(refreshedAccount).toMatchObject({
			currentBalanceAmount: '123.45000000',
			currentBalanceType: 'AVAILABLE',
		});

		const safeConnectionsResponse = await verifiedAgent.get('/bank-connections').expect(200);
		const safeConnection = safeConnectionsResponse.body.find(({id}: {id: string}) => id === connection.id);
		expect(safeConnection.bankAccounts[0].latestBalances).toEqual(
			expect.arrayContaining([
				expect.objectContaining({balanceType: 'AVAILABLE', amount: '123.45000000', isPrimary: true}),
				expect.objectContaining({balanceType: 'BOOKED', amount: '120.00000000', isPrimary: false}),
			]),
		);
		expect(JSON.stringify(safeConnectionsResponse.body)).not.toContain('sync-provider-session');
		expect(JSON.stringify(safeConnectionsResponse.body)).not.toContain('sync-provider-account');

		const transactionsResponse = await verifiedAgent
			.get(`/bank-connections/${connection.id}/transactions?limit=5`)
			.expect(200);
		expect(transactionsResponse.body.transactions).toHaveLength(5);
		expect(JSON.stringify(transactionsResponse.body)).not.toContain('provider-transaction-sync');
		expect(JSON.stringify(transactionsResponse.body)).not.toContain('provider-entry-sync');
		expect(transactionsResponse.body.transactions[0]).not.toHaveProperty('bankAccountId');

		getAccountBalances.mockResolvedValueOnce(balances);
		const updatedTransactions = makeTransactions('sync');
		updatedTransactions[0] = {
			...updatedTransactions[0],
			bankTransactionDescription: 'Updated card payment',
			balanceAfterAmount: '111.95',
			referenceNumber: 'reference-sync-0-updated',
		};
		getAccountTransactions.mockResolvedValueOnce(updatedTransactions);

		const secondResponse = await verifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(200);
		expect(secondResponse.body).toEqual(
			expect.objectContaining({
				status: 'SUCCEEDED',
				requestedFrom: expect.any(String),
				requestedTo: expect.any(String),
			}),
		);
		expect(await bankTransactionRepository.count({where: {bankAccountId: bankAccount.id}})).toBe(5);
		expect(await bankAccountBalanceRepository.count({where: {bankAccountId: bankAccount.id}})).toBe(4);
		const updatedTransaction = await bankTransactionRepository.findOneBy({
			bankAccountId: bankAccount.id,
			providerTransactionId: 'provider-transaction-sync-0',
		});
		expect(updatedTransaction).toMatchObject({
			bankTransactionDescription: 'Updated card payment',
			balanceAfterAmount: '111.95000000',
			referenceNumber: 'reference-sync-0-updated',
		});
	});

	it('validates representative transaction limits', async () => {
		const {connection} = await createAuthorizedConnection('limit-validation');

		try {
			for (const [limit, expectedStatus] of [
				['1', 200],
				['100', 200],
				['10oops', 400],
				['0', 400],
				['101', 400],
			] as const) {
				await verifiedAgent
					.get(`/bank-connections/${connection.id}/transactions`)
					.query({limit})
					.expect(expectedStatus);
			}
		} finally {
			await bankConnectionRepository.delete(connection.id);
		}
	});

	it('uses the default transaction limit when omitted', async () => {
		const {connection, bankAccount} = await createAuthorizedConnection('default-limit-validation');

		try {
			await bankTransactionRepository.save(
				Array.from({length: 26}, (_, index) =>
					bankTransactionRepository.create({
						bankAccountId: bankAccount.id,
						providerTransactionId: `default-limit-transaction-${index}`,
						entryReference: `default-limit-entry-${index}`,
						dedupeKey: faker.string.uuid(),
						bookingDate: '2026-08-26',
						valueDate: '2026-08-26',
						amount: '1.00',
						currency: 'EUR',
						creditDebitIndicator: 'CRDT',
						transactionStatus: 'BOOK',
						description: `Default limit transaction ${index}`,
					}),
				),
			);

			const response = await verifiedAgent.get(`/bank-connections/${connection.id}/transactions`).expect(200);

			expect(response.body.total).toBe(26);
			expect(response.body.transactions).toHaveLength(25);
		} finally {
			await bankConnectionRepository.delete(connection.id);
		}
	});

	it('enforces authentication, verification, ownership, and authorized status for synchronization', async () => {
		const {connection} = await createAuthorizedConnection('auth-check-session');

		await request(httpServer).post(`/bank-connections/${connection.id}/sync`).expect(401);
		await unverifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(403);
		await otherVerifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(404);
		await verifiedAgent.post('/bank-connections/not-a-uuid/sync').expect(400);

		const pendingConnection = await bankConnectionRepository.save(
			bankConnectionRepository.create({
				account,
				provider: 'enable-banking',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
				status: 'PENDING_AUTHORIZATION',
			}),
		);
		await verifiedAgent.post(`/bank-connections/${pendingConnection.id}/sync`).expect(409);
	});

	it('marks expired consent before synchronization', async () => {
		const connection = await bankConnectionRepository.save(
			bankConnectionRepository.create({
				account,
				provider: 'enable-banking',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
				status: 'AUTHORIZED',
				providerSessionId: app.get(BankingEncryptionService).encrypt('expired-session'),
				consentValidUntil: new Date(Date.now() - 1),
			}),
		);

		try {
			getSessionAccounts.mockClear();
			getAccountBalances.mockClear();
			getAccountTransactions.mockClear();
			await verifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(409);

			expect(getSessionAccounts).not.toHaveBeenCalled();
			expect(getAccountBalances).not.toHaveBeenCalled();
			expect(getAccountTransactions).not.toHaveBeenCalled();
			const expiredConnection = await bankConnectionRepository.findOneBy({id: connection.id});
			expect(expiredConnection).toMatchObject({
				status: 'EXPIRED',
				lastSyncError: 'Bank consent has expired. Please reconnect.',
			});
			expect(await bankSyncRunRepository.count({where: {bankConnection: {id: connection.id}}})).toBe(0);
		} finally {
			await bankConnectionRepository.delete(connection.id);
		}
	});

	it('reconciles bank account activity from the provider account set', async () => {
		const {connection, bankAccounts} = await createAuthorizedConnectionFixture(
			'account-reconciliation-session',
			['account-keep', 'account-remove', 'account-reappear'].map((providerAccountId) => ({
				providerAccountId,
				identificationHash: `hash-${providerAccountId}`,
			})),
		);
		await bankAccountRepository.update({id: bankAccounts[2].id}, {isActive: false});
		sessionAccountIdsBySession.set('account-reconciliation-session', ['account-keep', 'account-reappear']);
		getAccountBalances.mockResolvedValue([]);
		getAccountTransactions.mockResolvedValue([]);

		try {
			const response = await verifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(200);

			expect(response.body.status).toBe('SUCCEEDED');
			expect(await bankAccountRepository.findOneBy({id: bankAccounts[0].id})).toMatchObject({
				isActive: true,
			});
			expect(await bankAccountRepository.findOneBy({id: bankAccounts[1].id})).toMatchObject({
				isActive: false,
			});
			expect(await bankAccountRepository.findOneBy({id: bankAccounts[2].id})).toMatchObject({
				isActive: true,
			});
		} finally {
			await bankConnectionRepository.delete(connection.id);
		}
	});

	it('preserves bank account activity when the provider account set is unavailable', async () => {
		const {connection, bankAccounts} = await createAuthorizedConnectionFixture(
			'account-reconciliation-failure-session',
			['account-still-active', 'account-still-inactive'].map((providerAccountId) => ({
				providerAccountId,
				identificationHash: `hash-${providerAccountId}`,
			})),
		);
		await bankAccountRepository.update({id: bankAccounts[1].id}, {isActive: false});
		getSessionAccounts.mockRejectedValueOnce(new EnableBankingClientError('provider_unreachable'));
		getAccountBalances.mockResolvedValue([]);
		getAccountTransactions.mockResolvedValue([]);

		try {
			const response = await verifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(200);

			expect(response.body).toMatchObject({
				status: 'PARTIAL',
				errorMessage: 'Some bank data could not be synchronized.',
			});
			expect(await bankAccountRepository.findOneBy({id: bankAccounts[0].id})).toMatchObject({
				isActive: true,
			});
			expect(await bankAccountRepository.findOneBy({id: bankAccounts[1].id})).toMatchObject({
				isActive: false,
			});
		} finally {
			await bankConnectionRepository.delete(connection.id);
		}
	});

	it('returns provider rate-limit retry metadata for a partial sync', async () => {
		const {connection} = await createAuthorizedConnection('rate-limit-session');
		getAccountBalances.mockRejectedValueOnce(new EnableBankingClientError('ASPSP_RATE_LIMIT_EXCEEDED', 429, 17));
		getAccountTransactions.mockResolvedValue([]);

		try {
			const response = await verifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(200);

			expect(response.body).toMatchObject({
				status: 'PARTIAL',
				rateLimitSource: 'enable-banking',
				retryAfterSeconds: 17,
			});
		} finally {
			await bankConnectionRepository.delete(connection.id);
		}
	});

	it('marks a run partial when one account fails and preserves successful account data', async () => {
		const connection = await createAuthorizedConnectionWithAccounts('partial-session', [
			'partial-success-account',
			'partial-failed-account',
		]);
		getAccountBalances.mockImplementation(async (accountId) => {
			if (accountId === 'partial-failed-account') {
				throw new EnableBankingClientError('provider_unreachable');
			}
			return makeBalances();
		});
		getAccountTransactions.mockImplementation(async (accountId) => {
			if (accountId === 'partial-failed-account') {
				throw new EnableBankingClientError('provider_unreachable');
			}
			return makeTransactions('partial');
		});

		const response = await verifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(200);
		expect(response.body.status).toBe('PARTIAL');
		expect(response.body.errorMessage).toBe('Some bank data could not be synchronized.');
		const successfulBankAccount = await bankAccountRepository.findOne({
			where: {bankConnection: {id: connection.id}, providerAccountId: 'partial-success-account'},
		});
		if (!successfulBankAccount) throw new Error('Expected successful bank account.');
		expect(await bankTransactionRepository.count({where: {bankAccountId: successfulBankAccount.id}})).toBe(5);
		expect(JSON.stringify(response.body)).not.toContain('provider_unreachable');
	});

	it('rolls back balance and transaction persistence when a transaction cannot be stored', async () => {
		const {connection, bankAccount} = await createAuthorizedConnection('rollback-sync-session');
		getAccountBalances.mockResolvedValueOnce(makeBalances());
		getAccountTransactions.mockResolvedValueOnce([
			{
				...makeTransactions('rollback')[0],
				amount: 'not-a-number',
			},
		]);

		const response = await verifiedAgent.post(`/bank-connections/${connection.id}/sync`).expect(500);
		expect(response.body.message).toBe('Bank synchronization could not be saved.');
		expect(await bankAccountBalanceRepository.count({where: {bankAccountId: bankAccount.id}})).toBe(0);
		expect(await bankTransactionRepository.count({where: {bankAccountId: bankAccount.id}})).toBe(0);
		expect(await bankSyncRunRepository.count({where: {bankConnection: {id: connection.id}}})).toBe(1);
		expect(await bankSyncRunRepository.findOne({where: {bankConnection: {id: connection.id}}})).toMatchObject({
			status: 'FAILED',
			errorMessage: 'Bank synchronization could not be saved.',
		});
	});

	type BankAccountFixture = {
		providerAccountId: string;
		identificationHash: string;
		details?: string;
	};

	async function createAuthorizedConnection(providerSessionId: string) {
		const {connection, bankAccounts} = await createAuthorizedConnectionFixture(providerSessionId, [
			{
				providerAccountId: 'sync-provider-account',
				identificationHash: `hash-${providerSessionId}`,
				details: 'Test account',
			},
		]);
		return {connection, bankAccount: bankAccounts[0]};
	}

	async function createAuthorizedConnectionWithAccounts(providerSessionId: string, providerAccountIds: string[]) {
		const {connection} = await createAuthorizedConnectionFixture(
			providerSessionId,
			providerAccountIds.map((providerAccountId) => ({
				providerAccountId,
				identificationHash: `hash-${providerAccountId}`,
			})),
		);
		return connection;
	}

	async function createAuthorizedConnectionFixture(
		providerSessionId: string,
		bankAccountFixtures: BankAccountFixture[],
	) {
		const connection = await bankConnectionRepository.save(
			bankConnectionRepository.create({
				account,
				provider: 'enable-banking',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
				status: 'AUTHORIZED',
				providerSessionId: app.get(BankingEncryptionService).encrypt(providerSessionId),
				consentValidUntil: new Date(Date.now() + 60 * 60 * 1000),
			}),
		);
		const bankAccounts = await bankAccountRepository.save(
			bankAccountFixtures.map(({providerAccountId, identificationHash, details}) =>
				bankAccountRepository.create({
					bankConnection: connection,
					providerAccountId,
					identificationHash,
					name: 'Sync account',
					details,
					currency: 'EUR',
					isActive: true,
				}),
			),
		);
		sessionAccountIdsBySession.set(
			providerSessionId,
			bankAccounts.map((bankAccount) => bankAccount.providerAccountId),
		);
		return {connection, bankAccounts};
	}
});

function makeBalances(): EnableBankingBalance[] {
	return [
		{
			name: 'Available balance',
			balanceType: 'AVAILABLE',
			amount: '123.45',
			currency: 'EUR',
			lastChangeDateTime: '2026-08-26T12:00:00.000Z',
			referenceDate: '2026-08-26',
			lastCommittedTransaction: 'provider-entry-sync-last',
		},
		{
			name: 'Booked balance',
			balanceType: 'BOOKED',
			amount: '120.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
		},
	];
}

function makeTransactions(prefix: string): EnableBankingTransaction[] {
	return Array.from({length: 5}, (_, index) => ({
		providerTransactionId: `provider-transaction-${prefix}-${index}`,
		entryReference: `provider-entry-${prefix}-${index}`,
		merchantCategoryCode: '5411',
		amount: index === 0 ? '12.50' : '4.00',
		currency: 'EUR',
		creditDebitIndicator: index === 0 ? 'DBIT' : 'CRDT',
		status: 'BOOK',
		bookingDate: `2026-08-${String(26 - index).padStart(2, '0')}`,
		valueDate: `2026-08-${String(26 - index).padStart(2, '0')}`,
		description: `Provider description ${index}`,
		counterpartyName: `Counterparty ${index}`,
		remittanceInformation: `Payment ${index}`,
		transactionDate: index === 0 ? '2026-08-24' : `2026-08-${String(26 - index).padStart(2, '0')}`,
		bankTransactionCode: index === 0 ? 'PMNT' : undefined,
		bankTransactionSubCode: index === 0 ? 'CARD' : undefined,
		bankTransactionDescription: index === 0 ? 'Card payment' : undefined,
		balanceAfterAmount: index === 0 ? '110.95' : undefined,
		balanceAfterCurrency: index === 0 ? 'EUR' : undefined,
		instructedAmount: index === 0 ? '12.00' : undefined,
		instructedCurrency: index === 0 ? 'USD' : undefined,
		exchangeRate: index === 0 ? '0.9234' : undefined,
		exchangeRateUnitCurrency: index === 0 ? 'USD' : undefined,
		exchangeRateType: index === 0 ? 'SPOT' : undefined,
		referenceNumber: index === 0 ? 'reference-sync-0' : undefined,
		referenceNumberScheme: index === 0 ? 'RF' : undefined,
	}));
}
