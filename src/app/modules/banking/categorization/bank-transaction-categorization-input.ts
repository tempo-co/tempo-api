import {createHash} from 'node:crypto';

import {toBankTransactionDirection} from '../bank-transaction-direction';
import {normalizeBankTransactionType} from '../bank-transaction-type';
import {BankTransaction} from '../bank-transaction.entity';
import {truncate} from '../banking.utils';
import {BankTransactionCategorizationInput} from './bank-transaction-categorization.types';

const MAX_REMITTANCE_INFORMATION_LENGTH = 2_000;

type CategorizationHashInput = Omit<BankTransactionCategorizationInput, 'correlationId'>;

export function toBankTransactionCategorizationInput(
	transaction: Pick<
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
	>,
): BankTransactionCategorizationInput {
	const creditDebitIndicator = normalizeUppercase(transaction.creditDebitIndicator);
	const bankTransactionCode = normalizeUppercase(transaction.bankTransactionCode);
	const bankTransactionSubCode = normalizeUppercase(transaction.bankTransactionSubCode);
	const bankTransactionDescription = normalizeNullableText(transaction.bankTransactionDescription);
	const transactionType = normalizeBankTransactionType({
		code: bankTransactionCode ?? undefined,
		subCode: bankTransactionSubCode ?? undefined,
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
		merchantCategoryCode: normalizeNullableText(transaction.merchantCategoryCode),
		remittanceInformation: sanitizeRemittanceInformation(transaction.remittanceInformation),
	};
}

export function createBankTransactionCategorizationInputHash(
	value: BankTransaction | BankTransactionCategorizationInput,
): string {
	const input = isCategorizationInput(value) ? value : toBankTransactionCategorizationInput(value);
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
