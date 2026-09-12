import {createHash} from 'node:crypto';

import {BANK_TRANSACTION_TYPES} from '../bank-transaction-type';
import {BankTransaction} from '../bank-transaction.entity';
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
		| 'transactionType'
		| 'description'
		| 'counterpartyName'
		| 'bankTransactionDescription'
		| 'merchantCategoryCode'
		| 'remittanceInformation'
	>,
): BankTransactionCategorizationInput {
	const creditDebitIndicator = normalizeUppercase(transaction.creditDebitIndicator);

	return {
		correlationId: transaction.id,
		transactionDate: normalizeNullableText(transaction.transactionDate),
		bookingDate: normalizeNullableText(transaction.bookingDate),
		valueDate: normalizeNullableText(transaction.valueDate),
		amount: normalizeRequiredText(transaction.amount),
		currency: normalizeUppercase(transaction.currency) ?? '',
		creditDebitIndicator,
		direction: toDirection(creditDebitIndicator),
		transactionType: normalizeRequiredText(transaction.transactionType) || BANK_TRANSACTION_TYPES.OTHER,
		description: normalizeNullableText(transaction.description),
		counterpartyName: normalizeNullableText(transaction.counterpartyName),
		bankTransactionDescription: normalizeNullableText(transaction.bankTransactionDescription),
		merchantCategoryCode: normalizeNullableText(transaction.merchantCategoryCode),
		remittanceInformation: truncate(
			normalizeNullableText(transaction.remittanceInformation),
			MAX_REMITTANCE_INFORMATION_LENGTH,
		),
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
		amount: input.amount,
		currency: input.currency,
		creditDebitIndicator: input.creditDebitIndicator,
		direction: input.direction,
		transactionType: input.transactionType,
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

function truncate(value: string | null, maxLength: number): string | null {
	return value === null ? null : value.slice(0, maxLength);
}

function toDirection(indicator: string | null): BankTransactionCategorizationInput['direction'] {
	if (indicator === 'CRDT') return 'INCOME';
	if (indicator === 'DBIT') return 'EXPENSE';
	return 'UNKNOWN';
}
