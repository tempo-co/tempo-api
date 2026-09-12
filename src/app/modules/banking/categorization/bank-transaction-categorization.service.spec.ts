import {ConfigurationService} from '@core/config/config.service';
import {
	BANK_TRANSACTION_CATEGORIZATION_BATCH_SIZE,
	BANK_TRANSACTION_CATEGORIZATION_QUEUE,
	CATEGORIZE_BANK_TRANSACTIONS_JOB,
} from '@core/queue/queue.constants';

import {BankTransaction} from '../bank-transaction.entity';
import {BankTransactionCategorizationService} from './bank-transaction-categorization.service';
import {BankTransactionCategorizationInput} from './bank-transaction-categorization.types';
import {BankTransactionCategorizationProviderError} from './providers/openai-bank-transaction-categorization.provider';

function createTransaction(overrides: Partial<BankTransaction> = {}): BankTransaction {
	return {
		id: 'transaction-id',
		bankAccountId: 'account-id',
		providerTransactionId: 'provider-id',
		entryReference: 'entry-reference',
		dedupeKey: 'dedupe-key',
		transactionDate: '2026-09-01',
		bookingDate: '2026-09-02',
		valueDate: '2026-09-03',
		amount: '-12.50',
		currency: 'EUR',
		creditDebitIndicator: 'DBIT',
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
		balanceAfterAmount: null,
		balanceAfterCurrency: null,
		instructedAmount: null,
		instructedCurrency: null,
		exchangeRate: null,
		exchangeRateUnitCurrency: null,
		exchangeRateType: null,
		referenceNumber: null,
		referenceNumberScheme: null,
		category: null,
		categoryStatus: 'PENDING',
		categorySource: null,
		categoryConfidence: null,
		categoryInputHash: null,
		categoryAppliedInputHash: null,
		categoryProvider: null,
		categoryModel: null,
		categoryPromptVersion: null,
		categoryUpdatedAt: null,
		categoryLastError: null,
		createdAt: new Date('2026-09-01T00:00:00.000Z'),
		updatedAt: new Date('2026-09-01T00:00:00.000Z'),
		...overrides,
	} as unknown as BankTransaction;
}

function createUpdateQueryBuilder(results: readonly {affected: number}[] = [{affected: 1}] as const) {
	const builder = {
		update: jest.fn().mockReturnThis(),
		set: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		returning: jest.fn().mockReturnThis(),
		execute: jest.fn().mockResolvedValue({affected: 1}),
	};
	for (const result of results) builder.execute.mockResolvedValueOnce(result);
	return builder;
}

function createService({
	enabled = true,
	rows = [],
	providerResult = [],
	providerError,
	queryBuilder,
}: {
	enabled?: boolean;
	rows?: BankTransaction[];
	providerResult?: readonly BankTransactionCategorizationInput[];
	providerError?: BankTransactionCategorizationProviderError;
	queryBuilder?: ReturnType<typeof createUpdateQueryBuilder>;
} = {}) {
	const queue = {add: jest.fn().mockResolvedValue(undefined)};
	const provider = {
		categorize: jest.fn().mockImplementation(async (inputs: readonly BankTransactionCategorizationInput[]) => {
			if (providerError) throw providerError;
			return providerResult.length > 0
				? providerResult
				: inputs.map((input) => ({
						correlationId: input.correlationId,
						category: 'OTHER' as const,
						confidence: 0.5,
					}));
		}),
	};
	const config = {
		get: jest.fn((key: string) => {
			if (key === 'AI_CATEGORIZATION_ENABLED') return enabled;
			if (key === 'AI_CATEGORIZATION_PROVIDER') return 'openai';
			if (key === 'AI_CATEGORIZATION_MODEL') return 'configured-model';
			throw new Error(`Unexpected config key: ${key}`);
		}),
	} as unknown as ConfigurationService;
	const repository = {
		find: jest.fn().mockResolvedValue(rows),
		update: jest.fn().mockResolvedValue({affected: 1}),
		createQueryBuilder: jest.fn().mockReturnValue(queryBuilder ?? createUpdateQueryBuilder()),
	};
	const service = new BankTransactionCategorizationService(
		repository as never,
		queue as never,
		provider as never,
		config,
	);
	return {service, queue, provider, repository, config};
}

describe('BankTransactionCategorizationService queue scheduling', () => {
	it('deduplicates transaction IDs and enqueues deterministic batches of 50', async () => {
		const {service, queue} = createService();
		const ids = Array.from(
			{length: BANK_TRANSACTION_CATEGORIZATION_BATCH_SIZE + 1},
			(_, index) => `transaction-${index}`,
		);

		await service.enqueueForTransactions([...ids, ids[0]]);

		expect(queue.add).toHaveBeenCalledTimes(2);
		expect(queue.add.mock.calls[0][0]).toBe(CATEGORIZE_BANK_TRANSACTIONS_JOB);
		expect(queue.add.mock.calls[1][0]).toBe(CATEGORIZE_BANK_TRANSACTIONS_JOB);
		expect(queue.add.mock.calls[0][2]).toEqual({
			jobId: expect.any(String),
			removeOnFail: true,
		});
		expect(queue.add.mock.calls[1][2]).toEqual({
			jobId: expect.any(String),
			removeOnFail: true,
		});
		expect(queue.add.mock.calls[0][1].transactionIds).toHaveLength(50);
		expect(queue.add.mock.calls[1][1].transactionIds).toHaveLength(1);
		expect(
			[...queue.add.mock.calls[0][1].transactionIds, ...queue.add.mock.calls[1][1].transactionIds].sort(),
		).toEqual(ids.sort());
	});

	it('does not enqueue when AI categorization is disabled or IDs are empty', async () => {
		const disabled = createService({enabled: false});
		await disabled.service.enqueueForTransactions(['transaction-1']);
		await disabled.service.enqueueForTransactions([]);

		expect(disabled.queue.add).not.toHaveBeenCalled();
		expect(BANK_TRANSACTION_CATEGORIZATION_QUEUE).toBe('bank-transaction-categorization');
	});
});

describe('BankTransactionCategorizationService worker', () => {
	it('applies deterministic rules without calling the provider', async () => {
		const transaction = createTransaction({
			transactionType: 'SALARY',
			amount: '100.00',
			creditDebitIndicator: 'CRDT',
		});
		const {service, provider, repository} = createService({rows: [transaction]});

		await service.processTransactionJob([transaction.id]);

		expect(provider.categorize).not.toHaveBeenCalled();
		const categorizationQueryBuilder = repository.createQueryBuilder.mock.results[0].value;
		expect(categorizationQueryBuilder.set).toHaveBeenCalledWith(
			expect.objectContaining({category: 'INCOME', categoryStatus: 'COMPLETED', categorySource: 'RULE'}),
		);
	});

	it('splits more than 50 unresolved records into bounded provider calls', async () => {
		const rows = Array.from({length: 51}, (_, index) =>
			createTransaction({id: `transaction-${index}`, providerTransactionId: `provider-${index}`}),
		);
		const {service, provider} = createService({rows});

		await service.processTransactionJob(rows.map(({id}) => id));

		expect(provider.categorize).toHaveBeenCalledTimes(2);
		expect(provider.categorize.mock.calls[0][0]).toHaveLength(50);
		expect(provider.categorize.mock.calls[1][0]).toHaveLength(1);
	});

	it('excludes manual rows from claims and provider calls', async () => {
		const transaction = createTransaction({
			category: 'SHOPPING',
			categoryStatus: 'COMPLETED',
			categorySource: 'MANUAL',
		});
		const {service, provider, repository} = createService({rows: [transaction]});

		await service.processTransactionJob([transaction.id]);

		expect(provider.categorize).not.toHaveBeenCalled();
		expect(repository.update).toHaveBeenCalledWith(
			{id: transaction.id},
			expect.objectContaining({categoryInputHash: expect.any(String)}),
		);
		expect(repository.update.mock.calls.some(([, values]) => values.categorySource === 'AI')).toBe(false);
	});

	it('does not apply a provider result after the claimed input hash changes', async () => {
		const transaction = createTransaction();
		const queryBuilder = createUpdateQueryBuilder([{affected: 1}, {affected: 0}]);
		const {service, provider, repository} = createService({rows: [transaction], queryBuilder});

		await service.processTransactionJob([transaction.id]);

		expect(provider.categorize).toHaveBeenCalledTimes(1);
		expect(queryBuilder.set).toHaveBeenCalledWith(expect.objectContaining({categoryStatus: 'PROCESSING'}));
		expect(transaction.categorySource).toBeNull();
		expect(transaction.category).toBeNull();
		expect(repository.update.mock.calls.some(([, values]) => values.categorySource === 'AI')).toBe(false);
	});

	it('marks retryable provider failures as failed and rethrows them', async () => {
		const transaction = createTransaction();
		const failure = new BankTransactionCategorizationProviderError(
			'OpenAI categorization request failed (503).',
			true,
		);
		const {service, repository} = createService({rows: [transaction], providerError: failure});

		await expect(service.processTransactionJob([transaction.id])).rejects.toBe(failure);
		const failedUpdate = repository.createQueryBuilder.mock.results.at(-1)?.value;
		expect(failedUpdate.set).toHaveBeenCalledWith(
			expect.objectContaining({categoryStatus: 'FAILED', categoryLastError: failure.message}),
		);
	});

	it('reclaims stale processing rows but leaves fresh claims alone', async () => {
		const stale = createTransaction({
			id: 'stale-transaction',
			categoryStatus: 'PROCESSING',
			categoryUpdatedAt: new Date(Date.now() - 16 * 60 * 1000),
		});
		const fresh = createTransaction({
			id: 'fresh-transaction',
			categoryStatus: 'PROCESSING',
			categoryUpdatedAt: new Date(Date.now() - 1 * 60 * 1000),
		});
		const {service, provider} = createService({rows: [stale, fresh]});

		await service.processTransactionJob([stale.id, fresh.id]);

		expect(provider.categorize).toHaveBeenCalledTimes(1);
		expect(
			provider.categorize.mock.calls[0][0].map(
				({correlationId}: BankTransactionCategorizationInput) => correlationId,
			),
		).toEqual([stale.id]);
	});
});
