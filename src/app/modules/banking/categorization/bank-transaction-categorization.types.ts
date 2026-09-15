import type {BankTransactionDirection} from '../bank-transaction-direction';
import type {BankTransactionCategory} from './bank-transaction-category';

export const BANK_TRANSACTION_CATEGORIZATION_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type BankTransactionCategorizationStatus = (typeof BANK_TRANSACTION_CATEGORIZATION_STATUSES)[number];

export const BANK_TRANSACTION_CATEGORIZATION_SOURCES = ['AI', 'MANUAL'] as const;
export type BankTransactionCategorizationSource = (typeof BANK_TRANSACTION_CATEGORIZATION_SOURCES)[number];

export type BankTransactionCategorizationInput = {
	correlationId: string;
	transactionDate: string | null;
	bookingDate: string | null;
	valueDate: string | null;
	amount: string;
	currency: string;
	creditDebitIndicator: string | null;
	direction: BankTransactionDirection;
	transactionType: string;
	bankTransactionCode: string | null;
	bankTransactionSubCode: string | null;
	description: string | null;
	counterpartyName: string | null;
	bankTransactionDescription: string | null;
	merchantCategoryCode: string | null;
	remittanceInformation: string | null;
};

export type BankTransactionCategorizationWebSearchInput = {
	correlationId: string;
	amount: string;
	currency: string;
	direction: BankTransactionCategorizationInput['direction'];
	transactionType: string;
	merchantName: string;
	merchantCategoryCode: string | null;
};

export type BankTransactionCategorizationResult = {
	correlationId: string;
	category: BankTransactionCategory;
	confidence: number;
};

export type BankTransactionCategoryDefinition = {
	value: BankTransactionCategory;
	label: string;
	description: string;
};
