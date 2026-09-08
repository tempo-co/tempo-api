import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import {randomUUID} from 'node:crypto';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import {Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';
import {BankAccount} from '@modules/banking/bank-account.entity';
import {BankConnection} from '@modules/banking/bank-connection.entity';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';

import {
	SESSION_TEST_ACCOUNT_EMAIL,
	SESSION_TEST_ACCOUNT_PASSWORD,
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../../scripts/seed-data/seed.constants';
import {getApp} from '../../setup/e2e.setup';

describe('BankTransactionController', () => {
	let app: INestApplication;
	let httpServer: Server;
	let verifiedAgent: TestAgent;
	let unverifiedAgent: TestAgent;
	let otherVerifiedAgent: TestAgent;
	let account: Account;
	let bankConnectionRepository: Repository<BankConnection>;
	let bankAccountRepository: Repository<BankAccount>;
	let bankTransactionRepository: Repository<BankTransaction>;
	let fixtureConnection: BankConnection;
	let fixtureBankAccount: BankAccount;
	let fixtureTransaction: BankTransaction;

	beforeAll(async () => {
		app = getApp();
		httpServer = app.getHttpServer();
		const accountService = app.get(AccountService);
		const seededAccount = await accountService.findByEmail(VERIFIED_ACCOUNT_EMAIL);
		if (!seededAccount) throw new Error('Verified test account was not seeded.');
		account = seededAccount;

		bankConnectionRepository = app.get<Repository<BankConnection>>(getRepositoryToken(BankConnection));
		bankAccountRepository = app.get<Repository<BankAccount>>(getRepositoryToken(BankAccount));
		bankTransactionRepository = app.get<Repository<BankTransaction>>(getRepositoryToken(BankTransaction));

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

		fixtureConnection = await bankConnectionRepository.save(
			bankConnectionRepository.create({
				account,
				provider: 'enable-banking',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
				status: 'AUTHORIZED',
				consentValidUntil: new Date('2030-01-01T00:00:00.000Z'),
				providerSessionId: 'provider-session-must-not-leak',
			}),
		);
		fixtureBankAccount = await bankAccountRepository.save(
			bankAccountRepository.create({
				bankConnection: fixtureConnection,
				providerAccountId: 'provider-account-must-not-leak',
				identificationHash: 'identification-hash-must-not-leak',
				name: 'Main account',
				alias: 'Daily spending',
				currency: 'EUR',
				isActive: true,
			}),
		);
		const secondBankAccount = await bankAccountRepository.save(
			bankAccountRepository.create({
				bankConnection: fixtureConnection,
				providerAccountId: 'provider-account-second',
				identificationHash: 'identification-hash-second',
				name: 'Savings account',
				currency: 'EUR',
				isActive: true,
			}),
		);

		const transactions = await bankTransactionRepository.save([
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'provider-transaction-coffee',
				entryReference: 'provider-entry-coffee',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-26',
				valueDate: '2026-08-26',
				amount: '-4.50',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				transactionDate: '2026-08-24',
				transactionType: 'CARD_PAYMENT',
				transactionStatus: 'BOOK',
				bankTransactionCode: 'PMNT',
				bankTransactionSubCode: 'CARD',
				bankTransactionDescription: 'Card payment',
				description: 'Coffee shop',
				counterpartyName: 'Cafe',
				merchantCategoryCode: '5814',
				remittanceInformation: 'Morning coffee',
				balanceAfterAmount: '100.50',
				balanceAfterCurrency: 'EUR',
				instructedAmount: '4.50',
				instructedCurrency: 'USD',
				exchangeRate: '0.9234',
				exchangeRateUnitCurrency: 'USD',
				exchangeRateType: 'SPOT',
				referenceNumber: 'reference-coffee',
				referenceNumberScheme: 'RF',
			}),
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'provider-transaction-groceries',
				entryReference: 'provider-entry-groceries',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-25',
				valueDate: '2026-08-25',
				amount: '-30.00',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				transactionStatus: 'BOOK',
				description: 'Groceries',
				counterpartyName: 'Market',
				merchantCategoryCode: '5411',
				remittanceInformation: 'Weekly groceries',
			}),
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'provider-transaction-salary',
				entryReference: 'provider-entry-salary',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-20',
				valueDate: '2026-08-20',
				amount: '100.00',
				currency: 'EUR',
				creditDebitIndicator: 'CRDT',
				transactionStatus: 'BOOK',
				description: 'Salary',
				counterpartyName: 'Employer',
				merchantCategoryCode: null,
				remittanceInformation: 'Monthly income',
			}),
			bankTransactionRepository.create({
				bankAccountId: secondBankAccount.id,
				providerTransactionId: 'provider-transaction-savings',
				entryReference: 'provider-entry-savings',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-10',
				valueDate: '2026-08-10',
				amount: '20.00',
				currency: 'EUR',
				creditDebitIndicator: 'CRDT',
				transactionStatus: 'BOOK',
				description: 'Transfer',
				counterpartyName: 'Savings',
				merchantCategoryCode: null,
				remittanceInformation: 'Reserve',
			}),
		]);
		fixtureTransaction = transactions[0];
	});

	afterAll(async () => {
		await bankConnectionRepository
			.createQueryBuilder()
			.delete()
			.where('accountId = :accountId', {accountId: account.id})
			.execute();
	});

	it('requires an authenticated, verified account', async () => {
		const transactionPath = `/bank-transactions/${fixtureTransaction.id}`;

		await request(httpServer).get('/bank-transactions').expect(401);
		await request(httpServer).get(transactionPath).expect(401);
		await unverifiedAgent.get('/bank-transactions').expect(403);
		await unverifiedAgent.get(transactionPath).expect(403);
	});

	it('lists owner-scoped transactions with safe source metadata', async () => {
		const response = await verifiedAgent.get('/bank-transactions').expect(200);

		expect(response.body.total).toBe(4);
		expect(response.body.transactions[0]).toMatchObject({
			id: fixtureTransaction.id,
			transactionDate: '2026-08-24',
			bookingDate: '2026-08-26',
			amount: '-4.50000000',
			direction: 'EXPENSE',
			transactionType: 'CARD_PAYMENT',
			providerTransactionDescription: 'Card payment',
			balanceAfterAmount: '100.50000000',
			balanceAfterCurrency: 'EUR',
			instructedAmount: '4.50000000',
			instructedCurrency: 'USD',
			exchangeRate: '0.923400000000000000',
			exchangeRateUnitCurrency: 'USD',
			exchangeRateType: 'SPOT',
			referenceNumber: 'reference-coffee',
			referenceNumberScheme: 'RF',
			bankName: 'ABN AMRO',
			bankCountry: 'NL',
			bankAccountName: 'Main account',
			bankAccountAlias: 'Daily spending',
		});
		const serializedResponse = JSON.stringify(response.body);
		expect(serializedResponse).not.toContain('provider-transaction-coffee');
		expect(serializedResponse).not.toContain('provider-entry-coffee');
		expect(serializedResponse).not.toContain('identification-hash-must-not-leak');
		expect(serializedResponse).not.toContain('provider-account-must-not-leak');
		expect(response.body.transactions[0]).not.toHaveProperty('bankAccountId');
		expect(response.body.transactions[0]).not.toHaveProperty('dedupeKey');
		expect(response.body.transactions[0]).not.toHaveProperty('bankTransactionCode');
		expect(response.body.transactions[0]).not.toHaveProperty('bankTransactionSubCode');
	});

	it('uses default pagination and preserves the full total across pages', async () => {
		const additionalTransactions = await bankTransactionRepository.save(
			Array.from({length: 8}, (_, index) =>
				bankTransactionRepository.create({
					bankAccountId: fixtureBankAccount.id,
					providerTransactionId: `provider-transaction-default-${index}`,
					entryReference: `provider-entry-default-${index}`,
					dedupeKey: randomUUID(),
					bookingDate: '2026-08-01',
					valueDate: '2026-08-01',
					amount: '1.00',
					currency: 'EUR',
					creditDebitIndicator: 'CRDT',
					transactionStatus: 'BOOK',
					description: `Default pagination transaction ${index}`,
				}),
			),
		);

		try {
			const response = await verifiedAgent.get('/bank-transactions').expect(200);

			expect(response.body.total).toBe(12);
			expect(response.body.transactions).toHaveLength(10);
			expect(response.body.transactions[0]).toMatchObject({
				id: fixtureTransaction.id,
				bookingDate: '2026-08-26',
			});

			const firstPageIds = response.body.transactions.map(({id}: {id: string}) => id);
			const nextPageResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'pagination[pageIndex]': '1'})
				.expect(200);
			const nextPageIds = nextPageResponse.body.transactions.map(({id}: {id: string}) => id);

			expect(nextPageResponse.body.total).toBe(12);
			expect(nextPageResponse.body.transactions).toHaveLength(2);
			expect(new Set([...firstPageIds, ...nextPageIds]).size).toBe(12);
			expect(
				nextPageResponse.body.transactions.every(
					({bookingDate}: {bookingDate: string}) => bookingDate === '2026-08-01',
				),
			).toBe(true);
		} finally {
			await bankTransactionRepository.remove(additionalTransactions);
		}
	});

	it('supports pagination and sorting', async () => {
		const paginatedResponse = await verifiedAgent
			.get('/bank-transactions')
			.query({
				'pagination[pageIndex]': '0',
				'pagination[pageSize]': '10',
				'sort[by]': 'amount',
				'sort[order]': 'ASC',
			})
			.expect(200);

		expect(paginatedResponse.body.total).toBe(4);
		expect(paginatedResponse.body.transactions).toHaveLength(4);
		expect(paginatedResponse.body.transactions[0].amount).toBe('-30.00000000');

		const bookingDateAscendingResponse = await verifiedAgent
			.get('/bank-transactions')
			.query({
				'pagination[pageIndex]': '0',
				'pagination[pageSize]': '10',
				'sort[by]': 'bookingDate',
				'sort[order]': 'ASC',
			})
			.expect(200);

		expect(bookingDateAscendingResponse.body.transactions[0].bookingDate).toBe('2026-08-10');
	});

	it('applies date, account, and search filters', async () => {
		const filteredResponse = await verifiedAgent
			.get('/bank-transactions')
			.query({
				'filter[bookingDate][from]': '2026-08-21',
				'filter[bookingDate][to]': '2026-08-26',
				'filter[bankAccountIds][]': fixtureBankAccount.id,
				'filter[search]': 'coffee',
			})
			.expect(200);

		expect(filteredResponse.body.total).toBe(1);
		expect(filteredResponse.body.transactions[0].description).toBe('Coffee shop');
	});

	it.each([
		['a positive page index', 'pagination[pageIndex]', '1', 200],
		['the maximum page size', 'pagination[pageSize]', '50', 200],
		['a suffix in the page index', 'pagination[pageIndex]', '1oops', 400],
		['a negative page index', 'pagination[pageIndex]', '-1', 400],
		['zero page size', 'pagination[pageSize]', '0', 400],
		['a page size not in the allowed options', 'pagination[pageSize]', '11', 400],
	])('validates pagination input for %s', async (_case, field, value, expectedStatus) => {
		await verifiedAgent
			.get('/bank-transactions')
			.query({[field]: value})
			.expect(expectedStatus);
	});

	it.each([
		['an unsupported sort field', {'sort[by]': 'postedDate'}],
		['an unsupported sort order', {'sort[order]': 'DOWN'}],
		['an invalid booking date', {'filter[bookingDate][from]': '2026-99-99'}],
		['a malformed bank account ID', {'filter[bankAccountIds][]': 'not-a-uuid'}],
	])('rejects %s', async (_case, query) => {
		await verifiedAgent.get('/bank-transactions').query(query).expect(400);
	});

	it('does not expose another account’s transactions or details', async () => {
		const listResponse = await otherVerifiedAgent.get('/bank-transactions').expect(200);
		expect(listResponse.body).toEqual({transactions: [], total: 0});

		await otherVerifiedAgent.get(`/bank-transactions/${fixtureTransaction.id}`).expect(404);
	});

	it('validates transaction IDs and returns not found for missing transactions', async () => {
		await verifiedAgent.get('/bank-transactions/not-a-uuid').expect(400);
		await verifiedAgent.get(`/bank-transactions/${randomUUID()}`).expect(404);
	});

	it('returns safe transaction details for the owner', async () => {
		const response = await verifiedAgent.get(`/bank-transactions/${fixtureTransaction.id}`).expect(200);

		expect(response.body).toMatchObject({
			id: fixtureTransaction.id,
			transactionDate: '2026-08-24',
			description: 'Coffee shop',
			counterpartyName: 'Cafe',
			direction: 'EXPENSE',
			transactionType: 'CARD_PAYMENT',
			providerTransactionDescription: 'Card payment',
			balanceAfterAmount: '100.50000000',
			balanceAfterCurrency: 'EUR',
			instructedAmount: '4.50000000',
			instructedCurrency: 'USD',
			exchangeRate: '0.923400000000000000',
			exchangeRateUnitCurrency: 'USD',
			exchangeRateType: 'SPOT',
			referenceNumber: 'reference-coffee',
			referenceNumberScheme: 'RF',
			remittanceInformation: 'Morning coffee',
			bankName: 'ABN AMRO',
			bankAccountAlias: 'Daily spending',
		});
		expect(JSON.stringify(response.body)).not.toContain('provider-transaction-coffee');
		expect(JSON.stringify(response.body)).not.toContain('provider-entry-coffee');
		expect(response.body).not.toHaveProperty('bankTransactionCode');
		expect(response.body).not.toHaveProperty('bankTransactionSubCode');
	});
});
