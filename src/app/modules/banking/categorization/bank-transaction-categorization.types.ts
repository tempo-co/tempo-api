import type {BankTransactionDirection} from '../bank-transaction-direction';
import type {BankTransactionLocation} from '../bank-transaction-location';
import type {BankTransactionCategory} from './bank-transaction-category';

export const BANK_TRANSACTION_CATEGORIZATION_STATUSES = [
	'PENDING',
	'PROCESSING',
	'COMPLETED',
	'FAILED',
	'NOT_APPLICABLE',
] as const;
export type BankTransactionCategorizationStatus = (typeof BANK_TRANSACTION_CATEGORIZATION_STATUSES)[number];

export const BANK_TRANSACTION_CATEGORIZATION_SOURCES = ['AI', 'MANUAL', 'RULE'] as const;
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
	merchantLocation?: BankTransactionLocation | null;
	bankTransactionDescription: string | null;
	merchantCategoryCode: string | null;
	remittanceInformation: string | null;
};

export type BankTransactionCategorizationWebSearchInput = Pick<
	BankTransactionCategorizationInput,
	'correlationId' | 'amount' | 'currency' | 'direction' | 'transactionType' | 'merchantCategoryCode'
> & {
	merchantName: string;
	merchantLocation: string | null;
	approximateLocation?: BankTransactionLocation;
	searchQuery: string;
};

export const BANK_TRANSACTION_CATEGORIZATION_SEARCH_EVIDENCE_TYPES = [
	'PURCHASE_CONTEXT',
	'MERCHANT_IDENTITY_ONLY',
	'MCC',
	'INSUFFICIENT',
	'CONFLICTING',
] as const;
export type BankTransactionCategorizationSearchEvidenceType =
	(typeof BANK_TRANSACTION_CATEGORIZATION_SEARCH_EVIDENCE_TYPES)[number];

export type BankTransactionCategorizationSearchTrace = {
	queries: string[];
	sourceDomains: string[];
	evidenceType: BankTransactionCategorizationSearchEvidenceType;
};

export type BankTransactionCategorizationResult = {
	correlationId: string;
	category: BankTransactionCategory;
	confidence: number;
	searchTrace?: BankTransactionCategorizationSearchTrace;
};

export type BankTransactionCategoryDefinition = {
	value: BankTransactionCategory;
	label: string;
	description: string;
};
