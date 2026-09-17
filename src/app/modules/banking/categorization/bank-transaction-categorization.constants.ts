export const BANK_TRANSACTION_CATEGORIZATION_PROMPT_VERSION = 'bank-transaction-categorization-v3';
export const BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_PROMPT_VERSION =
	'bank-transaction-categorization-web-search-v4';
export const BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_SKIPPED_PROMPT_VERSION =
	'bank-transaction-categorization-web-search-skipped-v3';
export const BANK_TRANSACTION_CATEGORIZATION_WEB_SEARCH_FAILED_PROMPT_VERSION =
	'bank-transaction-categorization-web-search-failed-v3';
export const BANK_TRANSACTION_LEGACY_OTHER_PROMPT_VERSIONS = [
	'bank-transaction-categorization-v2',
	'bank-transaction-categorization-web-search-v2',
	'bank-transaction-categorization-web-search-skipped-v2',
	'bank-transaction-categorization-web-search-failed-v2',
] as const;
export const BANK_TRANSACTION_CATEGORIZATION_PROVIDER_NAME = 'openai';
export const BANK_TRANSACTION_CATEGORIZATION_REQUEST_TIMEOUT_MS = 30_000;
export const BANK_TRANSACTION_CATEGORIZATION_MAX_WEB_SEARCH_QUERY_LENGTH = 240;
export const BANK_TRANSACTION_CATEGORIZATION_MAX_SEARCH_TRACE_ITEMS = 20;
export const BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES = {
	category: null,
	categorySource: null,
	categoryConfidence: null,
	categoryAppliedInputHash: null,
	categoryProvider: null,
	categoryModel: null,
	categoryPromptVersion: null,
	categorySearchTrace: null,
	categoryLastError: null,
} as const;

export function isLegacyAmbiguousAiOther(transaction: {
	category: string | null;
	categoryStatus: string | null | undefined;
	categorySource: string | null;
	categoryPromptVersion: string | null;
	merchantCategoryCode: string | null;
	counterpartyName: string | null;
}): boolean {
	return (
		transaction.category === 'OTHER' &&
		transaction.categoryStatus === 'COMPLETED' &&
		transaction.categorySource === 'AI' &&
		transaction.merchantCategoryCode === null &&
		transaction.counterpartyName === null &&
		(BANK_TRANSACTION_LEGACY_OTHER_PROMPT_VERSIONS as readonly string[]).includes(
			transaction.categoryPromptVersion ?? '',
		)
	);
}
