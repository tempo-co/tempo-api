import {Injectable, Optional} from '@nestjs/common';
import OpenAI from 'openai';
import {z} from 'zod';

import {ConfigurationService} from '@core/config/config.service';

import {
	BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION,
	BANK_TRANSACTION_CATEGORIZATION_REQUEST_TIMEOUT_MS,
} from '../bank-transaction-categorization.constants';
import {
	BankTransactionCategorizationProvider,
	BankTransactionCategorizationProviderError,
} from '../bank-transaction-categorization.provider';
import {
	BankTransactionCategorizationInput,
	BankTransactionCategorizationResult,
	BankTransactionCategoryDefinition,
} from '../bank-transaction-categorization.types';
import {BANK_TRANSACTION_CATEGORIES} from '../bank-transaction-category';

const categorizationResponseSchema = z
	.object({
		classifications: z.array(
			z
				.object({
					correlationId: z.string().min(1),
					category: z.enum(BANK_TRANSACTION_CATEGORIES),
					confidence: z.number().min(0).max(1),
				})
				.strict(),
		),
	})
	.strict();

const categorizationResponseJsonSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		classifications: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					correlationId: {type: 'string'},
					category: {type: 'string', enum: BANK_TRANSACTION_CATEGORIES},
					confidence: {type: 'number'},
				},
				required: ['correlationId', 'category', 'confidence'],
			},
		},
	},
	required: ['classifications'],
} as const;

const CATEGORIZATION_INSTRUCTIONS = [
	'Classify each transaction into exactly one supplied category.',
	'Use only the transaction fields and category definitions in the JSON input.',
	'Do not infer information that is not present in the input.',
	'Return one classification for every correlationId, with confidence from 0 to 1.',
	'Use OTHER when the available evidence does not support a more specific category.',
].join(' ');

type OpenAiResponsesClient = Pick<OpenAI, 'responses'>;

type OpenAiProviderError = {
	status?: unknown;
	name?: unknown;
};

@Injectable()
export class OpenAiBankTransactionCategorizationProvider implements BankTransactionCategorizationProvider {
	private client?: OpenAiResponsesClient;
	private readonly model: string;
	private readonly apiKey?: string;

	constructor(configurationService: ConfigurationService, @Optional() client?: OpenAiResponsesClient) {
		this.model = configurationService.get('AI_CATEGORIZATION_MODEL');
		this.apiKey = configurationService.get('OPENAI_API_KEY');
		this.client = client;
	}

	async categorize(
		transactions: readonly BankTransactionCategorizationInput[],
		categories: readonly BankTransactionCategoryDefinition[],
	): Promise<readonly BankTransactionCategorizationResult[]> {
		const inputIds = transactions.map(({correlationId}) => correlationId);
		if (new Set(inputIds).size !== inputIds.length) {
			throw this.invalidResponseError();
		}

		const requestTransactions = transactions.map((transaction, index) => ({
			...this.toSafeInput(transaction),
			correlationId: String(index),
		}));
		let response: {output_text?: unknown};
		try {
			const client = this.client ?? (this.client = this.createClient());
			response = await client.responses.create({
				model: this.model,
				instructions: CATEGORIZATION_INSTRUCTIONS,
				input: JSON.stringify({
					categories: categories.map(({value, label, description}) => ({value, label, description})),
					transactions: requestTransactions,
				}),
				reasoning: {effort: 'low'},
				store: false,
				text: {
					format: {
						type: 'json_schema',
						name: 'bank_transaction_categorization',
						strict: true,
						schema: categorizationResponseJsonSchema,
					},
				},
			});
		} catch (error) {
			if (error instanceof BankTransactionCategorizationProviderError) throw error;
			throw this.toProviderError(error);
		}

		if (typeof response.output_text !== 'string' || response.output_text.trim() === '') {
			throw this.invalidResponseError();
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(response.output_text);
		} catch {
			throw this.invalidResponseError();
		}

		const validation = categorizationResponseSchema.safeParse(parsed);
		if (!validation.success) throw this.invalidResponseError();

		const outputIds = validation.data.classifications.map(({correlationId}) => correlationId);
		const requestIds = requestTransactions.map(({correlationId}) => correlationId);
		const outputIdSet = new Set(outputIds);
		if (
			outputIdSet.size !== outputIds.length ||
			outputIdSet.size !== requestIds.length ||
			requestIds.some((correlationId) => !outputIdSet.has(correlationId))
		) {
			throw this.invalidResponseError();
		}

		return validation.data.classifications.map((result) => ({
			...result,
			correlationId: transactions[Number(result.correlationId)].correlationId,
		}));
	}

	private createClient(): OpenAiResponsesClient {
		if (!this.apiKey) {
			throw new BankTransactionCategorizationProviderError('OpenAI categorization is not configured.', false);
		}

		return new OpenAI({
			apiKey: this.apiKey,
			maxRetries: 0,
			timeout: BANK_TRANSACTION_CATEGORIZATION_REQUEST_TIMEOUT_MS,
		});
	}

	private toSafeInput(transaction: BankTransactionCategorizationInput): BankTransactionCategorizationInput {
		return {
			correlationId: transaction.correlationId,
			transactionDate: transaction.transactionDate,
			bookingDate: transaction.bookingDate,
			valueDate: transaction.valueDate,
			amount: transaction.amount,
			currency: transaction.currency,
			creditDebitIndicator: transaction.creditDebitIndicator,
			direction: transaction.direction,
			transactionType: transaction.transactionType,
			description: transaction.description,
			counterpartyName: transaction.counterpartyName,
			bankTransactionDescription: transaction.bankTransactionDescription,
			merchantCategoryCode: transaction.merchantCategoryCode,
			remittanceInformation: transaction.remittanceInformation,
		};
	}

	private invalidResponseError(): BankTransactionCategorizationProviderError {
		return new BankTransactionCategorizationProviderError(
			'OpenAI returned an invalid categorization response.',
			true,
		);
	}

	private toProviderError(error: unknown): BankTransactionCategorizationProviderError {
		const status = this.getStatus(error);
		const statusMessage = status === undefined ? '' : ` (${status})`;
		return new BankTransactionCategorizationProviderError(
			`OpenAI categorization request failed${statusMessage}.`,
			status === undefined || status === 408 || status === 429 || status >= 500,
		);
	}

	private getStatus(error: unknown): number | undefined {
		if (!error || typeof error !== 'object') return undefined;
		const status = (error as OpenAiProviderError).status;
		return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
	}
}

export {BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION};
export {BankTransactionCategorizationProviderError};
