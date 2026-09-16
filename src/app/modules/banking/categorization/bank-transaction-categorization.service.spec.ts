import {ConfigurationService} from '@core/config/config.service';
import {
	BANK_TRANSACTION_CATEGORIZATION_BATCH_SIZE,
	BANK_TRANSACTION_CATEGORIZATION_QUEUE,
	CATEGORIZE_BANK_TRANSACTIONS_JOB,
} from '@core/queue/queue.constants';

import {BankTransaction} from '../bank-transaction.entity';
import {
	createBankTransactionCategorizationInputHash,
	toBankTransactionCategorizationInput,
} from './bank-transaction-categorization-input';
import {
	BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
	BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_FAILED_PROMPT_VERSION,
	BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION,
	BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_SKIPPED_PROMPT_VERSION,
} from './bank-transaction-categorization.constants';
import {BankTransactionCategorizationProviderError} from './bank-transaction-categorization.provider';
import {BankTransactionCategorizationService} from './bank-transaction-categorization.service';
import {
	BankTransactionCategorizationInput,
	BankTransactionCategorizationResult,
	BankTransactionCategorizationWebSearchInput,
} from './bank-transaction-categorization.types';

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
		merchantCategoryCode: null,
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

function createUpdateQueryBuilder(
	results: readonly {affected: number; raw?: readonly {id: string}[]}[] = [{affected: 1}] as const,
	rawRows: readonly {id: string}[] = [],
) {
	const builder = {
		update: jest.fn().mockReturnThis(),
		select: jest.fn().mockReturnThis(),
		set: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		orderBy: jest.fn().mockReturnThis(),
		take: jest.fn().mockReturnThis(),
		returning: jest.fn().mockReturnThis(),
		execute: jest.fn().mockResolvedValue({affected: 1}),
		getRawMany: jest.fn().mockResolvedValue(rawRows),
	};
	for (const result of results) builder.execute.mockResolvedValueOnce(result);
	return builder;
}

function createService({
	enabled = true,
	webSearchEnabled = false,
	webSearchMaxTransactions = 5,
	rows = [],
	providerResult = [],
	providerError,
	webSearchResult,
	webSearchError,
	queryBuilder,
}: {
	enabled?: boolean;
	webSearchEnabled?: boolean;
	webSearchMaxTransactions?: number;
	rows?: BankTransaction[];
	providerResult?: readonly BankTransactionCategorizationResult[];
	providerError?: BankTransactionCategorizationProviderError;
	webSearchResult?: readonly BankTransactionCategorizationResult[];
	webSearchError?: BankTransactionCategorizationProviderError;
	queryBuilder?: ReturnType<typeof createUpdateQueryBuilder>;
} = {}) {
	const queue = {addBulk: jest.fn().mockResolvedValue([])};
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
		categorizeWithWebSearch: jest
			.fn()
			.mockImplementation(async (inputs: readonly BankTransactionCategorizationWebSearchInput[]) => {
				if (webSearchError) throw webSearchError;
				return webSearchResult && webSearchResult.length > 0
					? webSearchResult
					: inputs.map((input) => ({
							correlationId: input.correlationId,
							category: 'SHOPPING' as const,
							confidence: 0.75,
						}));
			}),
	};
	const config = {
		get: jest.fn((key: string) => {
			if (key === 'AI_CATEGORIZATION_ENABLED') return enabled;
			if (key === 'AI_CATEGORIZATION_WEB_SEARCH_ENABLED') return webSearchEnabled;
			if (key === 'AI_CATEGORIZATION_WEB_SEARCH_MAX_TRANSACTIONS') return webSearchMaxTransactions;
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

		expect(queue.addBulk).toHaveBeenCalledTimes(1);
		const jobs = queue.addBulk.mock.calls[0][0];
		expect(jobs).toHaveLength(2);
		expect(jobs[0]).toEqual({
			name: CATEGORIZE_BANK_TRANSACTIONS_JOB,
			data: {transactionIds: expect.any(Array)},
			opts: {jobId: expect.any(String), removeOnFail: true},
		});
		expect(jobs[1]).toEqual({
			name: CATEGORIZE_BANK_TRANSACTIONS_JOB,
			data: {transactionIds: expect.any(Array)},
			opts: {jobId: expect.any(String), removeOnFail: true},
		});
		expect(jobs[0].data.transactionIds).toHaveLength(50);
		expect(jobs[1].data.transactionIds).toHaveLength(1);
		expect([...jobs[0].data.transactionIds, ...jobs[1].data.transactionIds].sort()).toEqual(ids.sort());
	});

	it('changes the job ID when the categorization input hash changes', async () => {
		const transaction = createTransaction({categoryInputHash: 'hash-a'});
		const {service, queue} = createService({rows: [transaction]});

		await service.enqueueForTransactions([transaction.id]);
		transaction.categoryInputHash = 'hash-b';
		await service.enqueueForTransactions([transaction.id]);

		expect(queue.addBulk).toHaveBeenCalledTimes(2);
		expect(queue.addBulk.mock.calls[0][0][0].opts.jobId).not.toBe(queue.addBulk.mock.calls[1][0][0].opts.jobId);
	});

	it('does not enqueue when AI categorization is disabled or IDs are empty', async () => {
		const disabled = createService({enabled: false});
		await disabled.service.enqueueForTransactions(['transaction-1']);
		await disabled.service.enqueueForTransactions([]);

		expect(disabled.queue.addBulk).not.toHaveBeenCalled();
		expect(BANK_TRANSACTION_CATEGORIZATION_QUEUE).toBe('bank-transaction-categorization');
	});
});

describe('BankTransactionCategorizationService web-search reconciliation', () => {
	it('selects only the configured number of completed OTHER rows for web-search backfill', async () => {
		const rows = Array.from({length: 114}, (_, index) =>
			createTransaction({
				id: `other-transaction-${index}`,
				category: 'OTHER',
				categoryStatus: 'COMPLETED',
				categorySource: 'AI',
				categoryInputHash: `input-hash-${index}`,
				categoryAppliedInputHash: `input-hash-${index}`,
				categoryPromptVersion: BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
			}),
		);
		const queryBuilder = createUpdateQueryBuilder();
		queryBuilder.getRawMany.mockResolvedValueOnce([]).mockResolvedValueOnce(rows.map(({id}) => ({id})));
		const {service, queue} = createService({rows, webSearchEnabled: true, queryBuilder});

		await service.onApplicationBootstrap();

		expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(2);
		const selectionQueries = [...queryBuilder.where.mock.calls, ...queryBuilder.andWhere.mock.calls]
			.map(([query]) => query)
			.join('\n');
		expect(selectionQueries).toContain('"category" = \'OTHER\'');
		expect(selectionQueries).toContain('"categoryStatus" = \'COMPLETED\'');
		expect(selectionQueries).toContain('"categorySource" IS DISTINCT FROM \'MANUAL\'');
		expect(selectionQueries).toContain('"categoryPromptVersion" IS DISTINCT FROM :webSearchPromptVersion');
		expect(selectionQueries).toContain('"categoryPromptVersion" IS DISTINCT FROM :webSearchSkippedPromptVersion');
		expect(selectionQueries).toContain('"categoryPromptVersion" IS DISTINCT FROM :webSearchFailedPromptVersion');
		expect(queryBuilder.orderBy).toHaveBeenCalledWith('transaction.id', 'ASC');
		expect(queryBuilder.take).toHaveBeenCalledWith(5);
		expect(queryBuilder.set).not.toHaveBeenCalled();
		expect(queue.addBulk).toHaveBeenCalledTimes(1);
		const jobs = queue.addBulk.mock.calls[0][0];
		expect(jobs).toHaveLength(1);
		expect(jobs[0].data.webSearchBackfill).toBe(true);
		expect(jobs[0].data.transactionIds).toEqual(rows.slice(0, 5).map(({id}) => id));
	});

	it('leaves completed OTHER rows eligible when queue enqueue fails', async () => {
		const transaction = createTransaction({
			id: 'queue-failure-transaction',
			category: 'OTHER',
			categoryStatus: 'COMPLETED',
			categorySource: 'AI',
			categoryInputHash: 'queue-failure-hash',
			categoryAppliedInputHash: 'queue-failure-hash',
			categoryPromptVersion: BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
		});
		const queryBuilder = createUpdateQueryBuilder();
		queryBuilder.getRawMany
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{id: transaction.id}])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{id: transaction.id}]);
		const {service, queue} = createService({rows: [transaction], webSearchEnabled: true, queryBuilder});
		queue.addBulk.mockRejectedValueOnce(new Error('Redis unavailable.'));

		await service.onApplicationBootstrap();

		expect(queryBuilder.set).not.toHaveBeenCalled();
		expect(transaction).toMatchObject({
			category: 'OTHER',
			categoryStatus: 'COMPLETED',
			categoryPromptVersion: BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
		});

		await service.onApplicationBootstrap();

		expect(queue.addBulk).toHaveBeenCalledTimes(2);
	});

	it('enqueues selected completed OTHER rows as web-search backfill jobs', async () => {
		const reset = createTransaction({
			id: 'reset-transaction',
			category: 'OTHER',
			categoryStatus: 'COMPLETED',
			categorySource: 'AI',
			categoryInputHash: 'reset-hash',
			categoryAppliedInputHash: 'reset-hash',
			categoryPromptVersion: BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
		});
		const raced = createTransaction({
			id: 'raced-transaction',
			category: 'OTHER',
			categoryStatus: 'COMPLETED',
			categorySource: 'AI',
			categoryInputHash: 'raced-hash',
			categoryAppliedInputHash: 'raced-hash',
			categoryPromptVersion: BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
		});
		const queryBuilder = createUpdateQueryBuilder();
		queryBuilder.getRawMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{id: reset.id}, {id: raced.id}]);
		const {service, queue} = createService({
			rows: [reset, raced],
			webSearchEnabled: true,
			queryBuilder,
		});

		await service.onApplicationBootstrap();

		expect(queryBuilder.set).not.toHaveBeenCalled();
		const jobs = queue.addBulk.mock.calls[0][0];
		expect(jobs.flatMap(({data}: {data: {transactionIds: string[]}}) => data.transactionIds)).toEqual(
			[reset.id, raced.id].sort(),
		);
		expect(jobs.every(({data}: {data: {webSearchBackfill?: boolean}}) => data.webSearchBackfill === true)).toBe(
			true,
		);
	});

	it('does not enqueue when the completed OTHER selection is empty', async () => {
		const queryBuilder = createUpdateQueryBuilder();
		queryBuilder.getRawMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		const {service, queue} = createService({webSearchEnabled: true, queryBuilder});

		await service.onApplicationBootstrap();

		expect(queue.addBulk).not.toHaveBeenCalled();
	});

	it('leaves skipped and failed web-search outcomes terminal across bootstrap reconciliation', async () => {
		const terminalRows = [
			createTransaction({
				id: 'skipped-transaction',
				category: 'OTHER',
				categoryStatus: 'COMPLETED',
				categorySource: 'AI',
				categoryPromptVersion: BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_SKIPPED_PROMPT_VERSION,
			}),
			createTransaction({
				id: 'failed-transaction',
				category: 'OTHER',
				categoryStatus: 'COMPLETED',
				categorySource: 'AI',
				categoryPromptVersion: BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_FAILED_PROMPT_VERSION,
			}),
		];
		const queryBuilder = createUpdateQueryBuilder();
		queryBuilder.getRawMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		const {service, queue} = createService({
			rows: terminalRows,
			webSearchEnabled: true,
			queryBuilder,
		});

		await service.onApplicationBootstrap();

		expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(2);
		expect(queue.addBulk).not.toHaveBeenCalled();
	});

	it('does not scan or enqueue completed OTHER rows when the web-search cap is zero', async () => {
		const queryBuilder = createUpdateQueryBuilder();
		const {service, queue} = createService({webSearchEnabled: true, webSearchMaxTransactions: 0, queryBuilder});

		await service.onApplicationBootstrap();

		expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
		expect(queryBuilder.set).not.toHaveBeenCalled();
		expect(queue.addBulk).not.toHaveBeenCalled();
	});

	it('does not scan or enqueue completed OTHER rows when web search is disabled', async () => {
		const queryBuilder = createUpdateQueryBuilder();
		const {service, queue} = createService({webSearchEnabled: false, queryBuilder});

		await service.onApplicationBootstrap();

		expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
		expect(queryBuilder.set).not.toHaveBeenCalled();
		expect(queue.addBulk).not.toHaveBeenCalled();
	});
});

describe('BankTransactionCategorizationService worker', () => {
	it('resets and claims a completed OTHER row from a web-search backfill job', async () => {
		const transaction = createTransaction({
			id: 'backfill-transaction',
			category: 'OTHER',
			categoryStatus: 'COMPLETED',
			categorySource: 'AI',
			categoryPromptVersion: BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
		});
		const inputHash = createBankTransactionCategorizationInputHash(
			toBankTransactionCategorizationInput(transaction),
		);
		transaction.categoryInputHash = inputHash;
		transaction.categoryAppliedInputHash = inputHash;
		const {service, provider} = createService({rows: [transaction], webSearchEnabled: true});

		await service.processTransactionJob([transaction.id], true);

		expect(provider.categorizeWithWebSearch).toHaveBeenCalledWith(
			[expect.objectContaining({correlationId: transaction.id})],
			expect.any(Array),
		);
		expect(transaction.category).toBe('SHOPPING');
		expect(transaction.categoryStatus).toBe('COMPLETED');
		expect(transaction.categoryPromptVersion).toBe(BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION);
	});

	it('sends only normal OTHER results to the web fallback and applies the web result', async () => {
		const specific = createTransaction({id: 'specific-transaction', counterpartyName: 'Cafe'});
		const other = createTransaction({id: 'other-transaction', counterpartyName: 'Ambiguous Cafe'});
		const {service, provider} = createService({
			rows: [specific, other],
			webSearchEnabled: true,
			providerResult: [
				{correlationId: specific.id, category: 'FOOD_AND_DRINK', confidence: 0.9},
				{correlationId: other.id, category: 'OTHER', confidence: 0.2},
			],
			webSearchResult: [{correlationId: other.id, category: 'SHOPPING', confidence: 0.8}],
		});

		await service.processTransactionJob([specific.id, other.id], true);

		expect(provider.categorizeWithWebSearch).toHaveBeenCalledTimes(1);
		expect(provider.categorizeWithWebSearch.mock.calls[0][0]).toEqual([
			expect.objectContaining({
				correlationId: other.id,
				amount: '-12.50',
				currency: 'EUR',
				direction: 'EXPENSE',
				transactionType: 'CARD_PAYMENT',
				merchantName: 'Ambiguous Cafe',
				merchantCategoryCode: null,
			}),
		]);
		expect(specific.category).toBe('FOOD_AND_DRINK');
		expect(specific.categoryPromptVersion).toBe(BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION);
		expect(other.category).toBe('SHOPPING');
		expect(other.categoryPromptVersion).toBe(BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION);
	});

	it('does not call web search for ordinary jobs when the fallback is enabled', async () => {
		const transaction = createTransaction({id: 'ordinary-other-transaction'});
		const {service, provider} = createService({
			rows: [transaction],
			webSearchEnabled: true,
			providerResult: [{correlationId: transaction.id, category: 'OTHER', confidence: 0.5}],
		});

		await service.processTransactionJob([transaction.id]);

		expect(provider.categorizeWithWebSearch).not.toHaveBeenCalled();
		expect(transaction.category).toBe('OTHER');
		expect(transaction.categoryPromptVersion).toBe(BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION);
	});

	it('does not call web search when the fallback is disabled', async () => {
		const transaction = createTransaction({id: 'other-transaction'});
		const {service, provider} = createService({
			rows: [transaction],
			providerResult: [{correlationId: transaction.id, category: 'OTHER', confidence: 0.5}],
		});

		await service.processTransactionJob([transaction.id]);

		expect(provider.categorizeWithWebSearch).not.toHaveBeenCalled();
		expect(transaction.category).toBe('OTHER');
		expect(transaction.categoryPromptVersion).toBe(BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION);
	});

	it('does not call web search when the configured candidate bound is zero', async () => {
		const transaction = createTransaction({id: 'other-transaction'});
		const {service, provider} = createService({
			rows: [transaction],
			webSearchEnabled: true,
			webSearchMaxTransactions: 0,
		});

		await service.processTransactionJob([transaction.id]);

		expect(provider.categorizeWithWebSearch).not.toHaveBeenCalled();
		expect(transaction.category).toBe('OTHER');
		expect(transaction.categoryPromptVersion).toBe(BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION);
	});

	it('caps web-search candidates in explicit backfill jobs', async () => {
		const rows = Array.from({length: 6}, (_, index) =>
			createTransaction({id: `other-transaction-${index}`, counterpartyName: `Merchant ${index}`}),
		);
		const {service, provider, queue} = createService({
			rows,
			webSearchEnabled: true,
			webSearchMaxTransactions: 5,
			providerResult: rows.map(({id}) => ({correlationId: id, category: 'OTHER' as const, confidence: 0.5})),
		});

		await service.processTransactionJob(
			rows.map(({id}) => id),
			true,
		);

		expect(provider.categorizeWithWebSearch).toHaveBeenCalledTimes(5);
		expect(provider.categorizeWithWebSearch.mock.calls.map(([inputs]) => inputs.length)).toEqual([1, 1, 1, 1, 1]);
		expect(
			provider.categorizeWithWebSearch.mock.calls.map(
				([inputs]) => (inputs as BankTransactionCategorizationWebSearchInput[])[0].correlationId,
			),
		).toEqual(rows.slice(0, 5).map(({id}) => id));
		expect(queue.addBulk).not.toHaveBeenCalled();
		expect(rows.slice(0, 5).every(({category}) => category === 'SHOPPING')).toBe(true);
		expect(rows[5].category).toBe('OTHER');
		expect(rows[5].categoryPromptVersion).toBe(BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION);
		expect(
			rows
				.slice(0, 5)
				.every(
					({categoryPromptVersion}) =>
						categoryPromptVersion === BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION,
				),
		).toBe(true);
	});

	it('keeps valid results and terminalizes only failed web-search chunks', async () => {
		const rows = Array.from({length: 5}, (_, index) =>
			createTransaction({id: `other-transaction-${index}`, counterpartyName: `Merchant ${index}`}),
		);
		const failure = new BankTransactionCategorizationProviderError(
			'OpenAI categorization request failed (503).',
			true,
		);
		const {service, provider} = createService({
			rows,
			webSearchEnabled: true,
			webSearchMaxTransactions: 5,
			providerResult: rows.map(({id}) => ({correlationId: id, category: 'OTHER' as const, confidence: 0.5})),
		});
		provider.categorizeWithWebSearch
			.mockImplementationOnce(async (inputs: readonly BankTransactionCategorizationWebSearchInput[]) =>
				inputs.map(({correlationId}) => ({correlationId, category: 'SHOPPING' as const, confidence: 0.75})),
			)
			.mockImplementationOnce(async (inputs: readonly BankTransactionCategorizationWebSearchInput[]) =>
				inputs.map(({correlationId}) => ({correlationId, category: 'SHOPPING' as const, confidence: 0.75})),
			)
			.mockImplementationOnce(async (inputs: readonly BankTransactionCategorizationWebSearchInput[]) =>
				inputs.map(({correlationId}) => ({correlationId, category: 'SHOPPING' as const, confidence: 0.75})),
			)
			.mockImplementationOnce(async (inputs: readonly BankTransactionCategorizationWebSearchInput[]) =>
				inputs.map(({correlationId}) => ({correlationId, category: 'SHOPPING' as const, confidence: 0.75})),
			)
			.mockRejectedValueOnce(failure);
		const logger = (service as unknown as {logger: {warn(message: string): void}}).logger;
		const warn = jest.spyOn(logger, 'warn').mockImplementation();

		try {
			await service.processTransactionJob(
				rows.map(({id}) => id),
				true,
			);

			expect(provider.categorizeWithWebSearch.mock.calls.map(([inputs]) => inputs.length)).toEqual([
				1, 1, 1, 1, 1,
			]);
			expect(rows.slice(0, 4).every(({category}) => category === 'SHOPPING')).toBe(true);
			expect(
				rows
					.slice(0, 4)
					.every(
						({categoryPromptVersion}) =>
							categoryPromptVersion === BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION,
					),
			).toBe(true);
			expect(rows[4].category).toBe('OTHER');
			expect(rows[4].categoryPromptVersion).toBe(
				BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_FAILED_PROMPT_VERSION,
			);
		} finally {
			warn.mockRestore();
		}
	});

	it('skips OTHER rows without a usable merchant name', async () => {
		const transaction = createTransaction({
			id: 'merchantless-transaction',
			counterpartyName: null,
			description: null,
			bankTransactionDescription: null,
		});
		const {service, provider} = createService({rows: [transaction], webSearchEnabled: true});

		await service.processTransactionJob([transaction.id], true);

		expect(provider.categorizeWithWebSearch).not.toHaveBeenCalled();
		expect(transaction.category).toBe('OTHER');
		expect(transaction.categoryPromptVersion).toBe(
			BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_SKIPPED_PROMPT_VERSION,
		);
	});

	it('keeps the normal result when web-search fallback fails', async () => {
		const transaction = createTransaction({id: 'web-failure-transaction'});
		const failure = new BankTransactionCategorizationProviderError(
			'OpenAI categorization request failed (503).',
			true,
		);
		const {service, provider} = createService({
			rows: [transaction],
			webSearchEnabled: true,
			webSearchError: failure,
		});
		const logger = (service as unknown as {logger: {warn(message: string): void}}).logger;
		const warn = jest.spyOn(logger, 'warn').mockImplementation();

		try {
			await expect(service.processTransactionJob([transaction.id], true)).resolves.toBeUndefined();
			expect(provider.categorizeWithWebSearch).toHaveBeenCalledTimes(1);
			expect(transaction.category).toBe('OTHER');
			expect(transaction.categoryStatus).toBe('COMPLETED');
			expect(transaction.categoryPromptVersion).toBe(
				BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_FAILED_PROMPT_VERSION,
			);
			expect(warn).toHaveBeenCalledWith(
				'Transaction web-search fallback failed: BankTransactionCategorizationProviderError',
			);
		} finally {
			warn.mockRestore();
		}
	});

	it('sends completed non-AI classifications to the provider', async () => {
		const transaction = createTransaction({
			category: 'INCOME',
			categoryStatus: 'COMPLETED',
			categorySource: 'LEGACY',
			categoryConfidence: '1.000',
			categoryInputHash: 'existing-hash',
			categoryAppliedInputHash: 'existing-hash',
		});
		const queryBuilder = createUpdateQueryBuilder();
		const {service, provider} = createService({rows: [transaction], queryBuilder});

		await service.processTransactionJob([transaction.id]);

		expect(provider.categorize).toHaveBeenCalledTimes(1);
		expect(queryBuilder.set).toHaveBeenCalledWith(
			expect.objectContaining({categoryStatus: 'COMPLETED', categorySource: 'AI'}),
		);
		expect(transaction.categorySource).toBe('AI');
	});

	it('splits more than 50 unresolved records into bounded provider calls', async () => {
		const rows = Array.from({length: 51}, (_, index) =>
			createTransaction({id: `transaction-${index}`, providerTransactionId: `provider-${index}`}),
		);
		const {service, provider, queue} = createService({rows});

		await service.processTransactionJob(rows.map(({id}) => id));

		expect(provider.categorize).toHaveBeenCalledTimes(1);
		expect(provider.categorize.mock.calls[0][0]).toHaveLength(50);
		expect(queue.addBulk).toHaveBeenCalledTimes(1);
		expect(queue.addBulk.mock.calls[0][0][0].data.transactionIds).toHaveLength(1);
	});

	it('keeps ordinary categorization batches at the standard size when web search is enabled', async () => {
		const rows = Array.from({length: 51}, (_, index) =>
			createTransaction({id: `transaction-${index}`, providerTransactionId: `provider-${index}`}),
		);
		const {service, provider, queue} = createService({rows, webSearchEnabled: true});

		await service.processTransactionJob(rows.map(({id}) => id));

		expect(provider.categorize).toHaveBeenCalledTimes(1);
		expect(provider.categorize.mock.calls[0][0]).toHaveLength(BANK_TRANSACTION_CATEGORIZATION_BATCH_SIZE);
		expect(provider.categorizeWithWebSearch).not.toHaveBeenCalled();
		expect(queue.addBulk).toHaveBeenCalledTimes(1);
		expect(queue.addBulk.mock.calls[0][0]).toHaveLength(1);
		expect(queue.addBulk.mock.calls[0][0][0].data.transactionIds).toEqual([rows[50].id]);
	});

	it('does not propagate web-search backfill to overflow jobs', async () => {
		const rows = Array.from({length: 51}, (_, index) =>
			createTransaction({id: `backfill-transaction-${index}`, providerTransactionId: `provider-${index}`}),
		);
		const {service, provider, queue} = createService({rows, webSearchEnabled: true});

		await service.processTransactionJob(
			rows.map(({id}) => id),
			true,
		);

		expect(provider.categorizeWithWebSearch).toHaveBeenCalledTimes(5);
		expect(queue.addBulk).toHaveBeenCalledTimes(1);
		expect(queue.addBulk.mock.calls[0][0]).toHaveLength(1);
		expect(queue.addBulk.mock.calls[0][0][0].data).toEqual({transactionIds: [rows[50].id]});
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
			expect.objectContaining({id: transaction.id, categoryInputHash: expect.anything()}),
			expect.objectContaining({categoryInputHash: expect.any(String)}),
		);
		expect(repository.update.mock.calls.some(([, values]) => values.categorySource === 'AI')).toBe(false);
	});

	it('does not categorize when a concurrent input hash update wins the race', async () => {
		const transaction = createTransaction();
		const {service, provider, repository} = createService({rows: [transaction]});
		repository.update.mockResolvedValueOnce({affected: 0});

		await service.processTransactionJob([transaction.id]);

		expect(provider.categorize).not.toHaveBeenCalled();
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
