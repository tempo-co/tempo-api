import {ConfigurationService} from '@core/config/config.service';

import {BankTransactionCategorizationProviderError} from '../bank-transaction-categorization.provider';
import {
	BankTransactionCategorizationInput,
	BankTransactionCategorizationResult,
} from '../bank-transaction-categorization.types';
import {BANK_TRANSACTION_CATEGORIES, BANK_TRANSACTION_CATEGORY_DEFINITIONS} from '../bank-transaction-category';
import {OpenAiBankTransactionCategorizationProvider} from './openai-bank-transaction-categorization.provider';

function createInput(correlationId: string): BankTransactionCategorizationInput {
	return {
		correlationId,
		transactionDate: '2026-09-01',
		bookingDate: '2026-09-02',
		valueDate: null,
		amount: '-10.00',
		currency: 'EUR',
		creditDebitIndicator: 'DBIT',
		direction: 'EXPENSE',
		transactionType: 'CARD_PAYMENT',
		bankTransactionCode: 'PMNT',
		bankTransactionSubCode: 'CARD',
		description: 'Coffee shop',
		counterpartyName: 'Cafe',
		bankTransactionDescription: 'Card payment',
		merchantCategoryCode: '5814',
		remittanceInformation: 'Morning coffee',
	};
}

function createProvider() {
	const responsesCreate = jest.fn();
	const client = {responses: {create: responsesCreate}};
	const config = {
		get: jest.fn((key: string) => {
			if (key === 'OPENAI_API_KEY') return 'test-secret-api-key';
			if (key === 'AI_CATEGORIZATION_MODEL') return 'configured-model';
			throw new Error(`Unexpected config key: ${key}`);
		}),
	} as unknown as ConfigurationService;
	const provider = new OpenAiBankTransactionCategorizationProvider(config, client as never);
	return {provider, responsesCreate};
}

function output(classifications: readonly BankTransactionCategorizationResult[]) {
	return JSON.stringify({classifications});
}

describe('OpenAiBankTransactionCategorizationProvider', () => {
	it('sends a private strict structured request using the configured model', async () => {
		const {provider, responsesCreate} = createProvider();
		responsesCreate.mockResolvedValue({
			output_text: output([{correlationId: '0', category: 'FOOD_AND_DRINK', confidence: 0.97}]),
		});
		const transactions = [createInput('transaction-1')];

		await expect(provider.categorize(transactions, BANK_TRANSACTION_CATEGORY_DEFINITIONS)).resolves.toEqual([
			{correlationId: 'transaction-1', category: 'FOOD_AND_DRINK', confidence: 0.97},
		]);

		expect(responsesCreate).toHaveBeenCalledTimes(1);
		const request = responsesCreate.mock.calls[0][0];
		expect(request).toMatchObject({
			model: 'configured-model',
			reasoning: {effort: 'low'},
			store: false,
		});
		expect(request).not.toHaveProperty('tools');
		expect(request.text.format).toMatchObject({
			type: 'json_schema',
			strict: true,
		});
		expect(request.text.format.schema.properties.classifications.items.properties.category.enum).toEqual(
			BANK_TRANSACTION_CATEGORIES,
		);
		expect(request.text.format.schema.additionalProperties).toBe(false);
		expect(request.text.format.schema.properties.classifications.items.additionalProperties).toBe(false);
		const sentInput = JSON.parse(request.input);
		expect(sentInput.transactions).toEqual([{...transactions[0], correlationId: '0'}]);
		expect(sentInput.categories).toEqual(BANK_TRANSACTION_CATEGORY_DEFINITIONS);
		expect(request.input).not.toContain('test-secret-api-key');
	});

	it('maps compact provider correlation IDs back to the original transaction IDs', async () => {
		const {provider, responsesCreate} = createProvider();
		responsesCreate.mockResolvedValue({
			output_text: output([
				{correlationId: '1', category: 'SHOPPING', confidence: 0.71},
				{correlationId: '0', category: 'FOOD_AND_DRINK', confidence: 0.93},
			]),
		});
		const transactions = [createInput('transaction-1'), createInput('transaction-2')];

		await expect(provider.categorize(transactions, BANK_TRANSACTION_CATEGORY_DEFINITIONS)).resolves.toEqual([
			{correlationId: 'transaction-2', category: 'SHOPPING', confidence: 0.71},
			{correlationId: 'transaction-1', category: 'FOOD_AND_DRINK', confidence: 0.93},
		]);
	});

	it('does not construct the SDK when no OpenAI key is configured', () => {
		const config = {
			get: jest.fn((key: string) => {
				if (key === 'AI_CATEGORIZATION_MODEL') return 'configured-model';
				if (key === 'OPENAI_API_KEY') return undefined;
				throw new Error(`Unexpected config key: ${key}`);
			}),
		} as unknown as ConfigurationService;

		expect(() => new OpenAiBankTransactionCategorizationProvider(config)).not.toThrow();
	});

	it.each([
		[
			'unknown category',
			JSON.stringify({classifications: [{correlationId: '0', category: 'UNKNOWN', confidence: 0.5}]}),
		],
		[
			'duplicate correlation ID',
			JSON.stringify({
				classifications: [
					{correlationId: '0', category: 'FOOD_AND_DRINK', confidence: 0.5},
					{correlationId: '0', category: 'SHOPPING', confidence: 0.5},
				],
			}),
		],
		[
			'missing correlation ID',
			JSON.stringify({
				classifications: [{correlationId: 'other-id', category: 'FOOD_AND_DRINK', confidence: 0.5}],
			}),
		],
		[
			'invalid confidence',
			JSON.stringify({
				classifications: [{correlationId: '0', category: 'FOOD_AND_DRINK', confidence: 2}],
			}),
		],
		['malformed JSON', '{not-json'],
	] as const)('rejects %s before returning results', async (_case, responseText) => {
		const {provider, responsesCreate} = createProvider();
		responsesCreate.mockResolvedValue({output_text: responseText});

		await expect(
			provider.categorize([createInput('transaction-1')], BANK_TRANSACTION_CATEGORY_DEFINITIONS),
		).rejects.toMatchObject<Partial<BankTransactionCategorizationProviderError>>({retryable: true});
	});

	it.each([
		[undefined, true],
		[408, true],
		[429, true],
		[500, true],
		[503, true],
		[400, false],
		[401, false],
		[403, false],
		[404, false],
	] as const)('maps provider status %s to retryable=%s', async (status, retryable) => {
		const {provider, responsesCreate} = createProvider();
		responsesCreate.mockRejectedValue({
			status,
			name: status === undefined ? 'APIConnectionTimeoutError' : 'APIError',
		});

		await expect(
			provider.categorize([createInput('transaction-1')], BANK_TRANSACTION_CATEGORY_DEFINITIONS),
		).rejects.toMatchObject<Partial<BankTransactionCategorizationProviderError>>({retryable});
	});

	it('does not expose credentials, input, or raw provider errors', async () => {
		const {provider, responsesCreate} = createProvider();
		responsesCreate.mockRejectedValue({
			status: 500,
			name: 'APIError',
			message: 'test-secret-api-key Coffee shop raw provider body',
			response: {data: 'Coffee shop raw provider body'},
		});

		const error = await provider
			.categorize([createInput('transaction-1')], BANK_TRANSACTION_CATEGORY_DEFINITIONS)
			.catch((value: unknown) => value);

		expect(error).toBeInstanceOf(BankTransactionCategorizationProviderError);
		if (!(error instanceof BankTransactionCategorizationProviderError)) throw new Error('Expected provider error.');
		expect(error.message).not.toContain('test-secret-api-key');
		expect(error.message).not.toContain('Coffee shop');
		expect(error.message).not.toContain('raw provider body');
	});
});
