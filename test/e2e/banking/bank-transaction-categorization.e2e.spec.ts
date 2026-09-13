import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import {randomUUID} from 'node:crypto';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import {Repository} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';
import {BankAccount} from '@modules/banking/bank-account.entity';
import {BankConnection} from '@modules/banking/bank-connection.entity';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';
import {BankTransactionCategorizationProviderError} from '@modules/banking/categorization/bank-transaction-categorization.provider';
import {BankTransactionCategorizationService} from '@modules/banking/categorization/bank-transaction-categorization.service';
import type {
	BankTransactionCategorizationInput,
	BankTransactionCategorizationResult,
} from '@modules/banking/categorization/bank-transaction-categorization.types';
import {OpenAiBankTransactionCategorizationProvider} from '@modules/banking/categorization/providers/openai-bank-transaction-categorization.provider';

import {VERIFIED_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_PASSWORD} from '../../../scripts/seed-data/seed.constants';
import {getApp} from '../../setup/e2e.setup';

const AI_CATEGORY = 'FOOD_AND_DRINK' as const;
const AI_CONFIDENCE = 0.875;
let shouldFail = false;

const categorizeSpy = jest
	.spyOn(OpenAiBankTransactionCategorizationProvider.prototype, 'categorize')
	.mockImplementation(
		async (
			transactions: readonly BankTransactionCategorizationInput[],
		): Promise<readonly BankTransactionCategorizationResult[]> => {
			if (shouldFail) {
				throw new BankTransactionCategorizationProviderError('synthetic provider failure', false);
			}
			return transactions.map(({correlationId}) => ({
				correlationId,
				category: AI_CATEGORY,
				confidence: AI_CONFIDENCE,
			}));
		},
	);

async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 10_000): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let value = await read();
	while (!predicate(value) && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		value = await read();
	}
	if (!predicate(value))
		throw new Error(`Timed out after ${timeoutMs}ms waiting for the expected response: ${JSON.stringify(value)}`);
	return value;
}

describe('Bank transaction categorization integration', () => {
	jest.setTimeout(30_000);

	let app: INestApplication<Server>;
	let httpServer: Server;
	let verifiedAgent: TestAgent;
	let account: Account;
	let bankConnectionRepository: Repository<BankConnection>;
	let bankAccountRepository: Repository<BankAccount>;
	let bankTransactionRepository: Repository<BankTransaction>;
	let fixtureConnection: BankConnection;
	let fixtureBankAccount: BankAccount;

	beforeAll(async () => {
		app = getApp();
		httpServer = app.getHttpServer();

		const configurationService = app.get(ConfigurationService);
		expect(configurationService.get('AI_CATEGORIZATION_ENABLED')).toBe(true);
		expect(configurationService.get('AI_CATEGORIZATION_PROVIDER')).toBe('openai');
		expect(configurationService.get('OPENAI_API_KEY')).toBeTruthy();

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

		fixtureConnection = await bankConnectionRepository.save(
			bankConnectionRepository.create({
				account,
				provider: 'enable-banking',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
				status: 'AUTHORIZED',
				consentValidUntil: new Date('2030-01-01T00:00:00.000Z'),
				providerSessionId: 'categorization-e2e-session',
			}),
		);
		fixtureBankAccount = await bankAccountRepository.save(
			bankAccountRepository.create({
				bankConnection: fixtureConnection,
				providerAccountId: 'categorization-e2e-account',
				identificationHash: 'categorization-e2e-identification',
				name: 'Categorization test account',
				currency: 'EUR',
				isActive: true,
			}),
		);
	});

	afterAll(async () => {
		categorizeSpy?.mockRestore();
		if (bankConnectionRepository && account) {
			await bankConnectionRepository
				.createQueryBuilder()
				.delete()
				.where('accountId = :accountId', {accountId: account.id})
				.execute();
		}
	});

	it('runs the real HTTP, database, queue, worker, and persistence path with a mocked provider response', async () => {
		const transaction = await bankTransactionRepository.save(
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'categorization-e2e-success',
				entryReference: 'categorization-e2e-success-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-09-01',
				valueDate: '2026-09-01',
				transactionDate: '2026-08-31',
				amount: '-47.25',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				transactionType: 'CARD_PAYMENT',
				transactionStatus: 'BOOK',
				bankTransactionDescription: 'Card purchase',
				description: 'Lantern Books',
				displayDescription: 'Lantern Books',
				counterpartyName: 'Lantern Books',
				merchantCategoryCode: '5942',
				remittanceInformation: 'Fiction and non-fiction',
			}),
		);

		await app.get(BankTransactionCategorizationService).enqueueForTransactions([transaction.id]);

		const response = await waitFor(
			() => verifiedAgent.get(`/bank-transactions/${transaction.id}`),
			(value) => value.status === 200 && value.body.categoryStatus === 'COMPLETED',
		);

		expect(response.body).toMatchObject({
			id: transaction.id,
			category: AI_CATEGORY,
			categoryStatus: 'COMPLETED',
			categorySource: 'AI',
			categoryConfidence: String(AI_CONFIDENCE),
		});
		expect(categorizeSpy).toHaveBeenCalledTimes(1);
		expect(categorizeSpy.mock.calls[0][0][0]).toMatchObject({
			correlationId: transaction.id,
			amount: '-47.25000000',
			currency: 'EUR',
			direction: 'EXPENSE',
			description: 'Lantern Books',
			counterpartyName: 'Lantern Books',
		});
		expect(categorizeSpy.mock.calls[0][1]).toHaveLength(19);

		const persisted = await bankTransactionRepository.findOneByOrFail({id: transaction.id});
		expect(persisted).toMatchObject({
			category: AI_CATEGORY,
			categoryStatus: 'COMPLETED',
			categorySource: 'AI',
			categoryConfidence: String(AI_CONFIDENCE),
			categoryProvider: 'openai',
		});
	});

	it('persists a provider failure through the real worker path without calling an external provider', async () => {
		shouldFail = true;
		const transaction = await bankTransactionRepository.save(
			bankTransactionRepository.create({
				bankAccountId: fixtureBankAccount.id,
				providerTransactionId: 'categorization-e2e-failure',
				entryReference: 'categorization-e2e-failure-entry',
				dedupeKey: randomUUID(),
				bookingDate: '2026-09-02',
				valueDate: '2026-09-02',
				transactionDate: '2026-09-02',
				amount: '-12.00',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				transactionType: 'CARD_PAYMENT',
				transactionStatus: 'BOOK',
				bankTransactionDescription: 'Card purchase',
				description: 'Synthetic provider failure',
				displayDescription: 'Synthetic provider failure',
				counterpartyName: 'Synthetic provider failure',
			}),
		);

		await app.get(BankTransactionCategorizationService).enqueueForTransactions([transaction.id]);

		const response = await waitFor(
			() => verifiedAgent.get(`/bank-transactions/${transaction.id}`),
			(value) => value.status === 200 && value.body.categoryStatus === 'FAILED',
		);

		expect(response.body).toMatchObject({
			id: transaction.id,
			category: null,
			categoryStatus: 'FAILED',
			categorySource: null,
			categoryConfidence: null,
		});
		expect(categorizeSpy).toHaveBeenCalledTimes(2);
		const persisted = await bankTransactionRepository.findOneByOrFail({id: transaction.id});
		expect(persisted.categoryLastError).toBe('Transaction categorization failed.');
	});
});
