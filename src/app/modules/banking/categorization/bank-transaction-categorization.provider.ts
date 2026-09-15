import type {
	BankTransactionCategorizationInput,
	BankTransactionCategorizationResult,
	BankTransactionCategorizationWebSearchInput,
	BankTransactionCategoryDefinition,
} from './bank-transaction-categorization.types';
import type {BankTransactionCategory} from './bank-transaction-category';

export const BANK_TRANSACTION_CATEGORIZATION_PROVIDER = Symbol('BANK_TRANSACTION_CATEGORIZATION_PROVIDER');

export interface BankTransactionCategorizationProvider {
	categorize(
		transactions: readonly BankTransactionCategorizationInput[],
		categories: readonly BankTransactionCategoryDefinition[],
	): Promise<readonly BankTransactionCategorizationResult[]>;
	categorizeWithWebSearch(
		transactions: readonly BankTransactionCategorizationWebSearchInput[],
		categories: readonly BankTransactionCategoryDefinition[],
	): Promise<readonly BankTransactionCategorizationResult[]>;
}

export class BankTransactionCategorizationProviderError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean,
	) {
		super(message);
		this.name = 'BankTransactionCategorizationProviderError';
	}
}

export type BankTransactionCategorizationProviderName = string;
export type BankTransactionCategorizationCategory = BankTransactionCategory;
