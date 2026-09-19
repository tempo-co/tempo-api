import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import {randomUUID} from 'node:crypto';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import {DataSource, Repository} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';
import {BankAccount} from '@modules/banking/bank-account.entity';
import {BankConnection} from '@modules/banking/bank-connection.entity';
import {
	BANK_TRANSACTION_CASH_FLOW_TREATMENTS,
	BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION,
	BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES,
	BANK_TRANSACTION_FINANCIAL_EVENT_TYPES,
	BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
} from '@modules/banking/bank-transaction-financial-event';
import {reconcileBankTransactionInternalTransfers} from '@modules/banking/bank-transaction-internal-transfer-reconciliation';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';
import {OpenAiBankTransactionCategorizationProvider} from '@modules/banking/categorization/providers/openai-bank-transaction-categorization.provider';

import {
	SESSION_TEST_ACCOUNT_EMAIL,
	SESSION_TEST_ACCOUNT_PASSWORD,
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../../scripts/seed-data/seed.constants';
import {getApp, loginAgent} from '../../setup/e2e.setup';

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
	let fixtureGroceriesTransaction: BankTransaction;
	let fixtureReviewTransaction: BankTransaction;
	let categorizeSpy: jest.SpyInstance;
	let categorizeWithWebSearchSpy: jest.SpyInstance;

	beforeAll(async () => {
		app = getApp();
		httpServer = app.getHttpServer();
		expect(app.get(ConfigurationService).get('AI_CATEGORIZATION_ENABLED')).toBe(false);
		expect(app.get(ConfigurationService).get('AI_CATEGORIZATION_WEB_SEARCH_ENABLED')).toBe(false);
		categorizeSpy = jest.spyOn(app.get(OpenAiBankTransactionCategorizationProvider), 'categorize');
		categorizeWithWebSearchSpy = jest.spyOn(
			app.get(OpenAiBankTransactionCategorizationProvider),
			'categorizeWithWebSearch',
		);
		const accountService = app.get(AccountService);
		const seededAccount = await accountService.findByEmail(VERIFIED_ACCOUNT_EMAIL);
		if (!seededAccount) throw new Error('Verified test account was not seeded.');
		account = seededAccount;

		bankConnectionRepository = app.get<Repository<BankConnection>>(getRepositoryToken(BankConnection));
		bankAccountRepository = app.get<Repository<BankAccount>>(getRepositoryToken(BankAccount));
		bankTransactionRepository = app.get<Repository<BankTransaction>>(getRepositoryToken(BankTransaction));

		verifiedAgent = await loginAgent(httpServer, VERIFIED_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_PASSWORD);
		unverifiedAgent = await loginAgent(httpServer, UNVERIFIED_ACCOUNT_EMAIL, UNVERIFIED_ACCOUNT_PASSWORD);
		otherVerifiedAgent = await loginAgent(httpServer, SESSION_TEST_ACCOUNT_EMAIL, SESSION_TEST_ACCOUNT_PASSWORD);

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
				amountInBaseCurrency: '-4.50',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				transactionDate: '2026-08-24',
				transactionType: 'CARD_PAYMENT',
				transactionStatus: 'BOOK',
				bankTransactionCode: 'PMNT',
				bankTransactionSubCode: 'CARD',
				bankTransactionDescription: 'Card payment',
				description: 'Coffee shop',
				displayDescription: 'Coffee shop',
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
				amountInBaseCurrency: '-30.00',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				transactionStatus: 'BOOK',
				description: 'Groceries',
				displayDescription: 'Groceries',
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
				amountInBaseCurrency: '100.00',
				currency: 'EUR',
				creditDebitIndicator: 'CRDT',
				transactionStatus: 'BOOK',
				description: 'Salary',
				displayDescription: 'Salary',
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
				amountInBaseCurrency: '20.00',
				currency: 'EUR',
				creditDebitIndicator: 'CRDT',
				transactionStatus: 'BOOK',
				description: 'Transfer',
				displayDescription: 'Transfer',
				counterpartyName: 'Savings',
				merchantCategoryCode: null,
				remittanceInformation: 'Reserve',
			}),
		]);
		fixtureTransaction = transactions[0];
		fixtureGroceriesTransaction = transactions[1];
		fixtureReviewTransaction = transactions[2];
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
		expect(categorizeSpy).not.toHaveBeenCalled();
		expect(categorizeWithWebSearchSpy).not.toHaveBeenCalled();
		expect(response.body.transactions[0]).toMatchObject({
			id: fixtureTransaction.id,
			transactionDate: '2026-08-24',
			bookingDate: '2026-08-26',
			amount: '-4.50000000',
			direction: 'EXPENSE',
			transactionType: 'CARD_PAYMENT',
			providerTransactionDescription: 'Card payment',
			category: null,
			categoryStatus: 'PENDING',
			categorySource: null,
			categoryConfidence: null,
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
					displayDescription: `Default pagination transaction ${index}`,
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

	it('sorts mixed currencies by normalized amount before pagination', async () => {
		const sortingTransactions = await bankTransactionRepository.save([
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'currency-sort-ron',
				entryReference: 'currency-sort-ron-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-01',
				valueDate: '2026-08-01',
				amount: '100.00',
				currency: 'RON',
				creditDebitIndicator: 'CRDT',
				transactionStatus: 'BOOK',
				description: 'Currency sort RON',
				displayDescription: 'Currency sort RON',
			}),
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'currency-sort-eur',
				entryReference: 'currency-sort-eur-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-01',
				valueDate: '2026-08-01',
				amount: '30.00',
				currency: 'EUR',
				creditDebitIndicator: 'CRDT',
				transactionStatus: 'BOOK',
				description: 'Currency sort EUR',
				displayDescription: 'Currency sort EUR',
			}),
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'currency-sort-unavailable',
				entryReference: 'currency-sort-unavailable-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-01',
				valueDate: '2026-08-01',
				amount: '1.00',
				currency: 'USD',
				creditDebitIndicator: 'CRDT',
				transactionStatus: 'BOOK',
				description: 'Currency sort unavailable',
				displayDescription: 'Currency sort unavailable',
			}),
		]);

		try {
			await bankTransactionRepository.query(
				`UPDATE "bank_transactions"
				 SET "amountInBaseCurrency" = CASE "providerTransactionId"
				   WHEN 'currency-sort-ron' THEN 20.00
				   WHEN 'currency-sort-eur' THEN 30.00
				 END
				 WHERE "id" IN ($1, $2, $3)`,
				sortingTransactions.map(({id}) => id),
			);

			const ascendingResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({
					'pagination[pageIndex]': '0',
					'pagination[pageSize]': '10',
					'filter[search]': 'Currency sort',
					'sort[by]': 'amount',
					'sort[order]': 'ASC',
				})
				.expect(200);

			expect(ascendingResponse.body.transactions.map(({id}: {id: string}) => id)).toEqual([
				sortingTransactions[0].id,
				sortingTransactions[1].id,
				sortingTransactions[2].id,
			]);

			const descendingResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({
					'pagination[pageIndex]': '0',
					'pagination[pageSize]': '10',
					'filter[search]': 'Currency sort',
					'sort[by]': 'amount',
					'sort[order]': 'DESC',
				})
				.expect(200);
			expect(descendingResponse.body.transactions.map(({id}: {id: string}) => id)).toEqual([
				sortingTransactions[1].id,
				sortingTransactions[0].id,
				sortingTransactions[2].id,
			]);
		} finally {
			await bankTransactionRepository.remove(sortingTransactions);
		}
	});

	it('supports category and source sorting', async () => {
		const sourceConnection = await bankConnectionRepository.save(
			bankConnectionRepository.create({
				account,
				provider: 'enable-banking',
				aspspName: 'ING',
				aspspCountry: 'NL',
				providerSessionId: randomUUID(),
				status: 'AUTHORIZED',
			}),
		);
		const sourceBankAccount = await bankAccountRepository.save(
			bankAccountRepository.create({
				bankConnection: sourceConnection,
				providerAccountId: 'source-sort-account',
				identificationHash: 'source-sort-identification',
				name: 'Other account',
				currency: 'EUR',
				isActive: true,
			}),
		);
		await bankTransactionRepository.save(
			bankTransactionRepository.create({
				bankAccountId: sourceBankAccount.id,
				providerTransactionId: 'source-sort-transaction',
				entryReference: 'source-sort-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-27',
				valueDate: '2026-08-27',
				amount: '1.00',
				currency: 'EUR',
				creditDebitIndicator: 'CRDT',
				transactionStatus: 'BOOK',
				description: 'Source sort transaction',
				displayDescription: 'Source sort transaction',
			}),
		);
		await bankTransactionRepository.update({id: fixtureTransaction.id}, {category: 'FOOD_AND_DRINK'});
		await bankTransactionRepository.update({id: fixtureGroceriesTransaction.id}, {category: 'SHOPPING'});

		try {
			const categoryAscendingResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'sort[by]': 'category', 'sort[order]': 'ASC'})
				.expect(200);
			expect(
				categoryAscendingResponse.body.transactions
					.slice(0, 2)
					.map(({category}: {category: string}) => category),
			).toEqual(['FOOD_AND_DRINK', 'SHOPPING']);

			const categoryDescendingResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'sort[by]': 'category', 'sort[order]': 'DESC'})
				.expect(200);
			expect(
				categoryDescendingResponse.body.transactions
					.slice(0, 2)
					.map(({category}: {category: string}) => category),
			).toEqual(['SHOPPING', 'FOOD_AND_DRINK']);

			const sourceAscendingResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'sort[by]': 'source', 'sort[order]': 'ASC'})
				.expect(200);
			expect(sourceAscendingResponse.body.transactions[0].bankName).toBe('ABN AMRO');
			expect(sourceAscendingResponse.body.transactions.at(-1).bankName).toBe('ING');

			const sourceDescendingResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'sort[by]': 'source', 'sort[order]': 'DESC'})
				.expect(200);
			expect(sourceDescendingResponse.body.transactions[0].bankName).toBe('ING');
		} finally {
			await bankTransactionRepository.update({id: fixtureTransaction.id}, {category: null});
			await bankTransactionRepository.update({id: fixtureGroceriesTransaction.id}, {category: null});
			await bankConnectionRepository.delete(sourceConnection.id);
		}
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

	it('applies one or multiple category filters', async () => {
		await bankTransactionRepository.update({id: fixtureTransaction.id}, {category: 'FOOD_AND_DRINK'});
		await bankTransactionRepository.update({id: fixtureGroceriesTransaction.id}, {category: 'SHOPPING'});

		try {
			const singleCategoryResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[categories][]': 'FOOD_AND_DRINK'})
				.expect(200);

			expect(singleCategoryResponse.body.total).toBe(1);
			expect(singleCategoryResponse.body.transactions[0].description).toBe('Coffee shop');

			const multipleCategoriesResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[categories][]': ['FOOD_AND_DRINK', 'SHOPPING']})
				.expect(200);

			expect(multipleCategoriesResponse.body.total).toBe(2);
			expect(
				multipleCategoriesResponse.body.transactions.map(({description}: {description: string}) => description),
			).toEqual(['Coffee shop', 'Groceries']);
		} finally {
			await bankTransactionRepository.update({id: fixtureTransaction.id}, {category: null});
			await bankTransactionRepository.update({id: fixtureGroceriesTransaction.id}, {category: null});
		}
	});

	it('filters uncategorized transactions and categorization sources', async () => {
		await bankTransactionRepository.update(
			{id: fixtureTransaction.id},
			{category: 'FOOD_AND_DRINK', categoryStatus: 'COMPLETED', categorySource: 'MANUAL'},
		);
		await bankTransactionRepository.update(
			{id: fixtureGroceriesTransaction.id},
			{category: 'SHOPPING', categoryStatus: 'COMPLETED', categorySource: 'AI'},
		);
		await bankTransactionRepository.update(
			{id: fixtureReviewTransaction.id},
			{
				category: 'NEEDS_REVIEW',
				categoryStatus: 'COMPLETED',
				categorySource: 'AI',
				categoryConfidence: '0.980',
				counterpartyName: null,
				merchantCategoryCode: null,
			},
		);

		try {
			const uncategorizedResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[categories][]': 'UNCATEGORIZED'})
				.expect(200);

			expect(uncategorizedResponse.body.total).toBe(1);
			expect(
				uncategorizedResponse.body.transactions.every(
					({category}: {category: string | null}) => category === null,
				),
			).toBe(true);

			const needsReviewResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[categories][]': 'NEEDS_REVIEW'})
				.expect(200);

			expect(needsReviewResponse.body.total).toBe(1);
			expect(needsReviewResponse.body.transactions[0]).toMatchObject({
				description: 'Salary',
				category: 'NEEDS_REVIEW',
				categoryStatus: 'COMPLETED',
				categorySource: 'AI',
				categoryConfidence: '0.980',
			});

			const mixedCategoryResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[categories][]': ['FOOD_AND_DRINK', 'UNCATEGORIZED']})
				.expect(200);

			expect(mixedCategoryResponse.body.total).toBe(2);
			expect(
				mixedCategoryResponse.body.transactions.map(({description}: {description: string}) => description),
			).toEqual(['Coffee shop', 'Transfer']);

			const manualResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[categorySources][]': 'MANUAL'})
				.expect(200);

			expect(manualResponse.body.total).toBe(1);
			expect(manualResponse.body.transactions[0].description).toBe('Coffee shop');

			const aiResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[categorySources][]': 'AI'})
				.expect(200);

			expect(aiResponse.body.total).toBe(2);
			expect(aiResponse.body.transactions.map(({description}: {description: string}) => description)).toEqual([
				'Groceries',
				'Salary',
			]);
		} finally {
			await bankTransactionRepository.update(
				{id: fixtureTransaction.id},
				{category: null, categoryStatus: 'PENDING', categorySource: null},
			);
			await bankTransactionRepository.update(
				{id: fixtureGroceriesTransaction.id},
				{category: null, categoryStatus: 'PENDING', categorySource: null},
			);
			await bankTransactionRepository.update(
				{id: fixtureReviewTransaction.id},
				{
					category: null,
					categoryStatus: 'PENDING',
					categorySource: null,
					categoryConfidence: null,
					categoryPromptVersion: null,
					counterpartyName: 'Employer',
					merchantCategoryCode: null,
				},
			);
		}
	});

	it('exposes and filters currency exchange events without treating them as uncategorized', async () => {
		const ruleExchange = await bankTransactionRepository.save(
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'provider-currency-exchange-rule',
				entryReference: 'entry-currency-exchange-rule',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-15',
				valueDate: '2026-08-15',
				amount: '-10.00',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				transactionStatus: 'BOOK',
				description: 'Exchanged to GBP',
				displayDescription: 'Exchanged to GBP',
				counterpartyName: null,
				category: null,
				categoryStatus: 'NOT_APPLICABLE',
				categorySource: null,
				financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
				financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.RULE,
				financialEventRuleVersion: BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION,
			}),
		);
		const manualExchange = await bankTransactionRepository.save(
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'provider-currency-exchange-manual',
				entryReference: 'entry-currency-exchange-manual',
				dedupeKey: randomUUID(),
				bookingDate: '2026-08-14',
				valueDate: '2026-08-14',
				amount: '11.00',
				currency: 'EUR',
				creditDebitIndicator: 'CRDT',
				transactionStatus: 'BOOK',
				description: 'Exchanged to EUR',
				displayDescription: 'Exchanged to EUR',
				counterpartyName: null,
				category: 'SHOPPING',
				categoryStatus: 'COMPLETED',
				categorySource: 'MANUAL',
				financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
				financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.RULE,
				financialEventRuleVersion: BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION,
			}),
		);

		try {
			const filteredResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[financialEventTypes][]': 'CURRENCY_EXCHANGE'})
				.expect(200);

			expect(filteredResponse.body.total).toBe(2);
			expect(filteredResponse.body.transactions).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: ruleExchange.id,
						financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
						financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.RULE,
						financialEventRuleVersion: BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION,
						cashFlowTreatment: BANK_TRANSACTION_CASH_FLOW_TREATMENTS.INTERNAL,
						category: null,
						categoryStatus: 'NOT_APPLICABLE',
					}),
					expect.objectContaining({
						id: manualExchange.id,
						category: 'SHOPPING',
						categorySource: 'MANUAL',
						cashFlowTreatment: BANK_TRANSACTION_CASH_FLOW_TREATMENTS.INTERNAL,
					}),
				]),
			);

			const uncategorizedResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[categories][]': 'UNCATEGORIZED'})
				.expect(200);
			expect(uncategorizedResponse.body.transactions.map(({id}: {id: string}) => id)).not.toContain(
				ruleExchange.id,
			);

			const connectionResponse = await verifiedAgent
				.get(`/bank-connections/${fixtureConnection.id}/transactions?limit=100`)
				.expect(200);
			expect(connectionResponse.body.transactions).toEqual(
				expect.arrayContaining([
					expect.objectContaining({id: ruleExchange.id, cashFlowTreatment: 'INTERNAL'}),
					expect.objectContaining({id: manualExchange.id, financialEventType: 'CURRENCY_EXCHANGE'}),
				]),
			);
		} finally {
			await bankTransactionRepository.delete([ruleExchange.id, manualExchange.id]);
		}
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
		['an unsupported category', {'filter[categories][]': 'NOT_A_CATEGORY'}],
		['an unsupported categorization source', {'filter[categorySources][]': 'RULE'}],
		['an unsupported financial event', {'filter[financialEventTypes][]': 'TRANSFER'}],
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
			displayDescription: 'Coffee shop',
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

	it('allows verified owners to correct categories without exposing audit fields', async () => {
		const transactionPath = `/bank-transactions/${fixtureTransaction.id}/category`;

		await request(httpServer).patch(transactionPath).send({category: 'FOOD_AND_DRINK'}).expect(401);
		await unverifiedAgent.patch(transactionPath).send({category: 'FOOD_AND_DRINK'}).expect(403);
		await otherVerifiedAgent.patch(transactionPath).send({category: 'FOOD_AND_DRINK'}).expect(404);
		await verifiedAgent.patch(transactionPath).send({category: 'NOT_A_CATEGORY'}).expect(400);

		const response = await verifiedAgent.patch(transactionPath).send({category: 'FOOD_AND_DRINK'}).expect(200);

		expect(response.body).toMatchObject({
			id: fixtureTransaction.id,
			category: 'FOOD_AND_DRINK',
			categoryStatus: 'COMPLETED',
			categorySource: 'MANUAL',
			categoryConfidence: null,
		});
		for (const field of [
			'categoryInputHash',
			'categoryAppliedInputHash',
			'categoryProvider',
			'categoryModel',
			'categoryPromptVersion',
			'categoryLastError',
		]) {
			expect(response.body).not.toHaveProperty(field);
		}

		const persisted = await bankTransactionRepository.findOneByOrFail({id: fixtureTransaction.id});
		expect(persisted).toMatchObject({
			category: 'FOOD_AND_DRINK',
			categoryStatus: 'COMPLETED',
			categorySource: 'MANUAL',
			categoryConfidence: null,
			categoryAppliedInputHash: expect.any(String),
			categoryProvider: null,
			categoryModel: null,
			categoryPromptVersion: null,
			categoryLastError: null,
		});
	});

	it('excludes a verified internal pair from future cash-flow consumers but keeps third-party transfers ordinary', async () => {
		const dataSource = app.get(DataSource);
		const ownAccountA = {scheme: 'IBAN' as const, value: 'NL91ABNA0417164300'};
		const ownAccountB = {scheme: 'IBAN' as const, value: 'NL20RABO0123456789'};
		const thirdPartyAccount = {scheme: 'IBAN' as const, value: 'NL30OTHER0000000000'};
		const secondaryConnection = await bankConnectionRepository.save(
			bankConnectionRepository.create({
				account,
				provider: 'enable-banking',
				aspspName: 'Synthetic Bank',
				aspspCountry: 'NL',
				status: 'AUTHORIZED',
				consentValidUntil: new Date('2030-01-01T00:00:00.000Z'),
				providerSessionId: 'synthetic-provider-session-internal-transfer',
			}),
		);
		const secondaryBankAccount = await bankAccountRepository.save(
			bankAccountRepository.create({
				bankConnection: secondaryConnection,
				providerAccountId: 'synthetic-provider-account-secondary',
				identificationHash: 'synthetic-identification-secondary',
				name: 'Synthetic savings',
				currency: 'EUR',
				accountIdentifier: ownAccountB,
				isActive: true,
			}),
		);
		fixtureBankAccount.accountIdentifier = ownAccountA;
		await bankAccountRepository.save(fixtureBankAccount);

		const transactions = await bankTransactionRepository.save([
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'synthetic-internal-debit',
				entryReference: 'synthetic-internal-debit-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-09-10',
				valueDate: '2026-09-10',
				amount: '-100.00',
				amountInBaseCurrency: '-100.00',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				transactionType: 'TRANSFER',
				transactionStatus: 'BOOK',
				description: 'Synthetic internal debit',
				displayDescription: 'Synthetic internal debit',
				counterpartyAccountIdentifier: ownAccountB,
			}),
			bankTransactionRepository.create({
				bankAccountId: secondaryBankAccount.id,
				providerTransactionId: 'synthetic-internal-credit',
				entryReference: 'synthetic-internal-credit-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-09-12',
				valueDate: '2026-09-12',
				amount: '100.40',
				amountInBaseCurrency: '100.40',
				currency: 'EUR',
				creditDebitIndicator: 'CRDT',
				transactionType: 'TRANSFER',
				transactionStatus: 'BOOK',
				description: 'Synthetic internal credit',
				displayDescription: 'Synthetic internal credit',
				counterpartyAccountIdentifier: ownAccountA,
			}),
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'synthetic-third-party-debit',
				entryReference: 'synthetic-third-party-debit-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-09-10',
				valueDate: '2026-09-10',
				amount: '-55.00',
				amountInBaseCurrency: '-55.00',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				transactionType: 'TRANSFER',
				transactionStatus: 'BOOK',
				description: 'Synthetic third-party debit',
				displayDescription: 'Synthetic third-party debit',
				counterpartyAccountIdentifier: thirdPartyAccount,
			}),
			bankTransactionRepository.create({
				bankAccountId: secondaryBankAccount.id,
				providerTransactionId: 'synthetic-third-party-credit',
				entryReference: 'synthetic-third-party-credit-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-09-10',
				valueDate: '2026-09-10',
				amount: '55.00',
				amountInBaseCurrency: '55.00',
				currency: 'EUR',
				creditDebitIndicator: 'CRDT',
				transactionType: 'TRANSFER',
				transactionStatus: 'BOOK',
				description: 'Synthetic third-party credit',
				displayDescription: 'Synthetic third-party credit',
				counterpartyAccountIdentifier: thirdPartyAccount,
			}),
		]);

		try {
			await dataSource.transaction((manager) => reconcileBankTransactionInternalTransfers(manager, account.id));

			const internalResponse = await verifiedAgent
				.get('/bank-transactions')
				.query({'filter[financialEventTypes][]': 'INTERNAL_TRANSFER', 'pagination[pageSize]': '50'})
				.expect(200);
			expect(internalResponse.body.total).toBe(2);
			expect(internalResponse.body.transactions).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						financialEventType: 'INTERNAL_TRANSFER',
						financialEventSource: 'MATCHER',
						financialEventRuleVersion: BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
						cashFlowTreatment: BANK_TRANSACTION_CASH_FLOW_TREATMENTS.INTERNAL,
					}),
				]),
			);
			expect(JSON.stringify(internalResponse.body)).not.toContain(ownAccountA.value);
			expect(JSON.stringify(internalResponse.body)).not.toContain(ownAccountB.value);

			const externalResponses = await Promise.all(
				transactions
					.slice(2)
					.map((transaction) => verifiedAgent.get(`/bank-transactions/${transaction.id}`).expect(200)),
			);
			expect(externalResponses.map(({body}) => body.cashFlowTreatment)).toEqual(['EXPENSE', 'INCOME']);
			expect(externalResponses.every(({body}) => body.financialEventType === null)).toBe(true);
		} finally {
			await bankTransactionRepository.delete(transactions.map(({id}) => id));
			await bankConnectionRepository.delete(secondaryConnection.id);
			fixtureBankAccount.accountIdentifier = null;
			await bankAccountRepository.save(fixtureBankAccount);
		}
	});
});
