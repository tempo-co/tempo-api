import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import {Repository} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';
import {BankTransactionCategorizationProviderError} from '@modules/banking/categorization/bank-transaction-categorization.provider';
import {BankTransactionCategorizationService} from '@modules/banking/categorization/bank-transaction-categorization.service';
import type {
	BankTransactionCategorizationInput,
	BankTransactionCategorizationResult,
} from '@modules/banking/categorization/bank-transaction-categorization.types';
import {OpenAiBankTransactionCategorizationProvider} from '@modules/banking/categorization/providers/openai-bank-transaction-categorization.provider';

import {VERIFIED_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_PASSWORD} from '../../../scripts/seed-data/seed.constants';
import {
	CATEGORIZATION_E2E_AI_TRANSACTION_ID,
	CATEGORIZATION_E2E_FAILURE_TRANSACTION_ID,
	seedBankTransactionCategorizationData,
} from '../../setup/e2e-categorization-data';
import {enableAiCategorizationE2e, getApp} from '../../setup/e2e.setup';

enableAiCategorizationE2e();

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
	let bankTransactionRepository: Repository<BankTransaction>;

	beforeAll(async () => {
		app = getApp();
		await seedBankTransactionCategorizationData(app);
		httpServer = app.getHttpServer();

		const configurationService = app.get(ConfigurationService);
		expect(configurationService.get('AI_CATEGORIZATION_ENABLED')).toBe(true);
		expect(configurationService.get('AI_CATEGORIZATION_PROVIDER')).toBe('openai');
		expect(configurationService.get('OPENAI_API_KEY')).toBeTruthy();

		bankTransactionRepository = app.get<Repository<BankTransaction>>(getRepositoryToken(BankTransaction));
		verifiedAgent = request.agent(httpServer);
		await verifiedAgent
			.post('/auth/login')
			.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
			.expect(200);
	});

	afterAll(() => {
		shouldFail = false;
		categorizeSpy.mockRestore();
	});

	it('runs the real HTTP, database, queue, worker, and persistence path with a mocked provider response', async () => {
		const categorizationService = app.get(BankTransactionCategorizationService);
		await categorizationService.enqueueForTransactions([CATEGORIZATION_E2E_AI_TRANSACTION_ID]);

		const response = await waitFor(
			() => verifiedAgent.get(`/bank-transactions/${CATEGORIZATION_E2E_AI_TRANSACTION_ID}`),
			(value) => value.status === 200 && value.body.categoryStatus === 'COMPLETED',
		);

		expect(response.body).toMatchObject({
			id: CATEGORIZATION_E2E_AI_TRANSACTION_ID,
			category: AI_CATEGORY,
			categoryStatus: 'COMPLETED',
			categorySource: 'AI',
			categoryConfidence: String(AI_CONFIDENCE),
		});
		expect(categorizeSpy).toHaveBeenCalledTimes(1);
		expect(categorizeSpy.mock.calls[0][0][0]).toMatchObject({
			correlationId: CATEGORIZATION_E2E_AI_TRANSACTION_ID,
			amount: '-47.25000000',
			currency: 'EUR',
			direction: 'EXPENSE',
			description: 'Lantern Books',
			counterpartyName: 'Lantern Books',
			bankTransactionCode: 'PMNT',
			bankTransactionSubCode: 'CARD',
			merchantCategoryCode: '5814',
		});
		expect(categorizeSpy.mock.calls[0][1]).toHaveLength(19);

		const persisted = await bankTransactionRepository.findOneByOrFail({id: CATEGORIZATION_E2E_AI_TRANSACTION_ID});
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
		try {
			const categorizationService = app.get(BankTransactionCategorizationService);
			await categorizationService.enqueueForTransactions([CATEGORIZATION_E2E_FAILURE_TRANSACTION_ID]);

			const response = await waitFor(
				() => verifiedAgent.get(`/bank-transactions/${CATEGORIZATION_E2E_FAILURE_TRANSACTION_ID}`),
				(value) => value.status === 200 && value.body.categoryStatus === 'FAILED',
			);

			expect(response.body).toMatchObject({
				id: CATEGORIZATION_E2E_FAILURE_TRANSACTION_ID,
				category: null,
				categoryStatus: 'FAILED',
				categorySource: null,
			});
			expect(categorizeSpy).toHaveBeenCalledTimes(2);
			const persisted = await bankTransactionRepository.findOneByOrFail({
				id: CATEGORIZATION_E2E_FAILURE_TRANSACTION_ID,
			});
			expect(persisted.categoryLastError).toBe('Transaction categorization failed.');
		} finally {
			shouldFail = false;
		}
	});
});
