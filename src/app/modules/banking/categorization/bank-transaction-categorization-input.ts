import {createHash} from 'node:crypto';

import {toBankTransactionDirection} from '../bank-transaction-direction';
import {getBankTransactionDisplayDescription} from '../bank-transaction-display';
import {normalizeBankTransactionType} from '../bank-transaction-type';
import {BankTransaction} from '../bank-transaction.entity';
import {truncate} from '../banking.utils';
import {BANK_TRANSACTION_CATEGORIZATION_MAX_WEB_SEARCH_QUERY_LENGTH} from './bank-transaction-categorization.constants';
import {
	BankTransactionCategorizationInput,
	BankTransactionCategorizationWebSearchInput,
} from './bank-transaction-categorization.types';

const MAX_REMITTANCE_INFORMATION_LENGTH = 2_000;
const MAX_WEB_SEARCH_MERCHANT_NAME_LENGTH = 160;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi;
const URL_PATTERN = /\b(?:https?|ftp):\/\/[^\s]+|\bwww\.[^\s]+/gi;
const DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?\b/gi;
const IBAN_PATTERN = /\b[A-Z]{2}[\s_-]?\d{2}(?:[\s_-]?[A-Z0-9]{2,4}){4,8}\b/gi;
const LABELED_IDENTIFIER_PATTERN =
	/\b(?:iban|account|acct|rekening|reference|ref|order|invoice|identifier|id|pas|nr)\s*[:#=_-]?\s*(?=[A-Z0-9_-]*\d)[A-Z0-9_-]+\b/gi;
const FORMATTED_NUMERIC_IDENTIFIER_PATTERN = /(?<![A-Z0-9])\+?\d[\d\s()./-]{5,}\d(?![A-Z0-9])/gi;
const UNLABELED_ALPHANUMERIC_IDENTIFIER_PATTERN =
	/\b(?=[A-Z0-9_-]*[A-Z])(?=[A-Z0-9_-]*\d[A-Z0-9_-]*\d[A-Z0-9_-]*\d)[A-Z0-9_-]+\b/gi;
const LONG_DIGIT_PATTERN = /\b\d{4,}\b/g;
const CARD_LOCATION_PATTERN = /,\s*\d{2}[./]\d{2}[./]\d{2}\/\d{2}:\d{2}\s+(.+)$/i;

type CategorizationHashInput = Omit<BankTransactionCategorizationInput, 'correlationId'>;

type BankTransactionCategorizationTransaction = Pick<
	BankTransaction,
	| 'id'
	| 'transactionDate'
	| 'bookingDate'
	| 'valueDate'
	| 'amount'
	| 'currency'
	| 'creditDebitIndicator'
	| 'bankTransactionCode'
	| 'bankTransactionSubCode'
	| 'description'
	| 'counterpartyName'
	| 'bankTransactionDescription'
	| 'merchantCategoryCode'
	| 'remittanceInformation'
> & {
	aspspName?: string | null;
};

export function toBankTransactionCategorizationInput(
	transaction: BankTransactionCategorizationTransaction,
): BankTransactionCategorizationInput {
	const creditDebitIndicator = normalizeUppercase(transaction.creditDebitIndicator);
	const bankTransactionCode = normalizeUppercase(transaction.bankTransactionCode);
	const bankTransactionSubCode = normalizeUppercase(transaction.bankTransactionSubCode);
	const bankTransactionDescription = normalizeNullableText(transaction.bankTransactionDescription);
	const transactionType = normalizeBankTransactionType({
		code: bankTransactionCode ?? undefined,
		subCode: bankTransactionSubCode ?? undefined,
		aspspName: transaction.aspspName,
	});

	return {
		correlationId: transaction.id,
		transactionDate: normalizeNullableText(transaction.transactionDate),
		bookingDate: normalizeNullableText(transaction.bookingDate),
		valueDate: normalizeNullableText(transaction.valueDate),
		amount: normalizeRequiredText(transaction.amount),
		currency: normalizeUppercase(transaction.currency) ?? '',
		creditDebitIndicator,
		direction: toBankTransactionDirection(creditDebitIndicator),
		transactionType,
		bankTransactionCode,
		bankTransactionSubCode,
		description: normalizeNullableText(transaction.description),
		counterpartyName: normalizeNullableText(transaction.counterpartyName),
		bankTransactionDescription,
		merchantCategoryCode: normalizeMerchantCategoryCode(transaction.merchantCategoryCode),
		remittanceInformation: sanitizeRemittanceInformation(transaction.remittanceInformation),
	};
}

export function toBankTransactionCategorizationWebSearchInput(
	input: BankTransactionCategorizationInput,
): BankTransactionCategorizationWebSearchInput | null {
	const merchantDetails = getWebSearchMerchantDetails(input);
	const merchantName = sanitizeWebSearchMerchantName(merchantDetails.merchantName);
	if (!merchantName) return null;
	const merchantLocation = sanitizeWebSearchMerchantName(merchantDetails.merchantLocation);
	const searchTerms = [
		merchantName,
		merchantLocation && !containsSearchTerm(merchantName, merchantLocation) ? merchantLocation : null,
	].filter(Boolean);
	const searchQuery =
		truncate(searchTerms.join(' '), BANK_TRANSACTION_CATEGORIZATION_MAX_WEB_SEARCH_QUERY_LENGTH) ?? merchantName;

	return {
		correlationId: input.correlationId,
		amount: input.amount,
		currency: input.currency,
		direction: input.direction,
		transactionType: input.transactionType,
		merchantName,
		merchantLocation,
		searchQuery,
		merchantCategoryCode: input.merchantCategoryCode,
	};
}

function getWebSearchMerchantDetails(input: BankTransactionCategorizationInput): {
	merchantName: string | null;
	merchantLocation: string | null;
} {
	const counterpartyName = normalizeNullableText(input.counterpartyName);
	const description = normalizeNullableText(input.description);
	const merchantName =
		counterpartyName ??
		(description ? getBankTransactionDisplayDescription({description, counterpartyName: null}) : null) ??
		normalizeNullableText(input.bankTransactionDescription);
	const merchantLocation = description?.match(CARD_LOCATION_PATTERN)?.[1]?.trim() ?? null;

	return {merchantName, merchantLocation};
}

export function createBankTransactionCategorizationInputHash(
	value: BankTransaction | BankTransactionCategorizationInput,
): string {
	const input = isCategorizationInput(value)
		? value
		: toBankTransactionCategorizationInput({
				...value,
				aspspName: value.bankAccount?.bankConnection?.aspspName,
			});
	const hashInput: CategorizationHashInput = {
		transactionDate: input.transactionDate,
		bookingDate: input.bookingDate,
		valueDate: input.valueDate,
		amount: normalizeAmountForHash(input.amount),
		currency: input.currency,
		creditDebitIndicator: input.creditDebitIndicator,
		direction: input.direction,
		transactionType: input.transactionType,
		bankTransactionCode: input.bankTransactionCode,
		bankTransactionSubCode: input.bankTransactionSubCode,
		description: input.description,
		counterpartyName: input.counterpartyName,
		bankTransactionDescription: input.bankTransactionDescription,
		merchantCategoryCode: input.merchantCategoryCode,
		remittanceInformation: input.remittanceInformation,
	};

	return createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');
}

export const getBankTransactionCategorizationInputHash = createBankTransactionCategorizationInputHash;

function isCategorizationInput(
	value: BankTransaction | BankTransactionCategorizationInput,
): value is BankTransactionCategorizationInput {
	return 'direction' in value;
}

function sanitizeRemittanceInformation(value: string | null | undefined): string | null {
	const normalized = normalizeNullableText(value);
	if (!normalized) return null;

	return truncate(
		normalized
			.replace(/\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi, '[REDACTED]')
			.replace(/\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{2,4}){4,8}\b/g, '[REDACTED]')
			.replace(
				/\b(?:iban|account|acct|rekening|reference|ref|nr)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{3,}\b/gi,
				'[REDACTED]',
			)
			.replace(/\b\d{6,}\b/g, '[REDACTED]'),
		MAX_REMITTANCE_INFORMATION_LENGTH,
	);
}

function sanitizeWebSearchMerchantName(value: string | null | undefined): string | null {
	const normalized = normalizeNullableText(value);
	if (!normalized) return null;

	const paymentDomainMerchantName = normalized.match(
		/^(?:https?:\/\/)?(?:www\.)?(?:payment|pay|checkout)\.([a-z][a-z-]*(?:\.[a-z][a-z-]*)*)$/i,
	)?.[1];
	if (paymentDomainMerchantName) return truncate(paymentDomainMerchantName, MAX_WEB_SEARCH_MERCHANT_NAME_LENGTH);

	const sanitized = normalized
		.replace(URL_PATTERN, ' ')
		.replace(EMAIL_PATTERN, ' ')
		.replace(DOMAIN_PATTERN, ' ')
		.replace(IBAN_PATTERN, ' ')
		.replace(LABELED_IDENTIFIER_PATTERN, ' ')
		.replace(FORMATTED_NUMERIC_IDENTIFIER_PATTERN, ' ')
		.replace(UNLABELED_ALPHANUMERIC_IDENTIFIER_PATTERN, ' ')
		.replace(LONG_DIGIT_PATTERN, ' ')
		.replace(/[,:;|]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	return sanitized.length > 0 ? truncate(sanitized, MAX_WEB_SEARCH_MERCHANT_NAME_LENGTH) : null;
}

function containsSearchTerm(value: string, term: string): boolean {
	const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
	return new RegExp(`(?:^|\\s)${escapedTerm}(?:$|\\s)`, 'i').test(value);
}

function normalizeNullableText(value: string | null | undefined): string | null {
	const normalized = value?.trim() ?? '';
	return normalized.length > 0 ? normalized : null;
}

function normalizeRequiredText(value: string | null | undefined): string {
	return value?.trim() ?? '';
}

function normalizeUppercase(value: string | null | undefined): string | null {
	const normalized = normalizeNullableText(value);
	return normalized?.toUpperCase() ?? null;
}

export function normalizeMerchantCategoryCode(value: string | null | undefined): string | null {
	const normalized = normalizeNullableText(value);
	return normalized !== null && /^\d{4}$/.test(normalized) ? normalized : null;
}

function normalizeAmountForHash(value: string): string {
	const normalized = normalizeRequiredText(value);
	const match = normalized.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
	if (!match) return normalized;

	const [, sign, integerPart, fractionPart = ''] = match;
	const integer = integerPart.replace(/^0+(?=\d)/, '');
	const fraction = fractionPart.replace(/0+$/, '');
	const normalizedSign = sign === '-' && (integer !== '0' || fraction.length > 0) ? '-' : '';
	return `${normalizedSign}${integer}${fraction.length > 0 ? `.${fraction}` : ''}`;
}
