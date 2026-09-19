import type {BankTransactionDirection} from './bank-transaction-direction';

export const BANK_TRANSACTION_FINANCIAL_EVENT_TYPES = {
	CURRENCY_EXCHANGE: 'CURRENCY_EXCHANGE',
	INTERNAL_TRANSFER: 'INTERNAL_TRANSFER',
} as const;
export type BankTransactionFinancialEventType =
	(typeof BANK_TRANSACTION_FINANCIAL_EVENT_TYPES)[keyof typeof BANK_TRANSACTION_FINANCIAL_EVENT_TYPES];

export const BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES = {
	RULE: 'RULE',
} as const;
export type BankTransactionFinancialEventSource =
	(typeof BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES)[keyof typeof BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES];

export const BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION = 'revolut-currency-exchange-v1';

export const BANK_TRANSACTION_CASH_FLOW_TREATMENTS = {
	INCOME: 'INCOME',
	EXPENSE: 'EXPENSE',
	INTERNAL: 'INTERNAL',
	UNKNOWN: 'UNKNOWN',
} as const;
export type BankTransactionCashFlowTreatment =
	(typeof BANK_TRANSACTION_CASH_FLOW_TREATMENTS)[keyof typeof BANK_TRANSACTION_CASH_FLOW_TREATMENTS];

export type BankTransactionFinancialEvent = {
	type: BankTransactionFinancialEventType;
	source: BankTransactionFinancialEventSource;
	ruleVersion: string;
};

export type BankTransactionFinancialEventInput = {
	provider: string | null | undefined;
	aspspName: string | null | undefined;
	accountCurrency: string | null | undefined;
	transactionCurrency: string | null | undefined;
	creditDebitIndicator: string | null | undefined;
	description: string | null | undefined;
};

const EXCHANGED_TO_DESCRIPTION = /^Exchanged to ([A-Z]{3})$/i;

export function detectBankTransactionFinancialEvent(
	input: BankTransactionFinancialEventInput,
): BankTransactionFinancialEvent | null {
	if (!isRevolutEnableBankingTransaction(input)) return null;

	const accountCurrency = normalizeCurrency(input.accountCurrency);
	const transactionCurrency = normalizeCurrency(input.transactionCurrency);
	if (!accountCurrency || !transactionCurrency || accountCurrency !== transactionCurrency) return null;

	const description = normalizeDescription(input.description);
	const targetCurrency = description ? EXCHANGED_TO_DESCRIPTION.exec(description)?.[1] : undefined;
	if (!targetCurrency) return null;

	const normalizedTargetCurrency = targetCurrency.toUpperCase();
	const indicator = input.creditDebitIndicator?.trim().toUpperCase();
	const isSourceLeg = indicator === 'DBIT' && transactionCurrency !== normalizedTargetCurrency;
	const isTargetLeg = indicator === 'CRDT' && transactionCurrency === normalizedTargetCurrency;
	if (!isSourceLeg && !isTargetLeg) return null;

	return {
		type: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
		source: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.RULE,
		ruleVersion: BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION,
	};
}

export function getBankTransactionCashFlowTreatment(
	financialEventType: BankTransactionFinancialEventType | string | null | undefined,
	direction: BankTransactionDirection | string | null | undefined,
): BankTransactionCashFlowTreatment {
	if (
		financialEventType === BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE ||
		financialEventType === BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER
	) {
		return BANK_TRANSACTION_CASH_FLOW_TREATMENTS.INTERNAL;
	}
	if (direction === BANK_TRANSACTION_CASH_FLOW_TREATMENTS.INCOME) {
		return BANK_TRANSACTION_CASH_FLOW_TREATMENTS.INCOME;
	}
	if (direction === BANK_TRANSACTION_CASH_FLOW_TREATMENTS.EXPENSE) {
		return BANK_TRANSACTION_CASH_FLOW_TREATMENTS.EXPENSE;
	}
	return BANK_TRANSACTION_CASH_FLOW_TREATMENTS.UNKNOWN;
}

function isRevolutEnableBankingTransaction(input: BankTransactionFinancialEventInput): boolean {
	return (
		input.provider?.trim().toLowerCase() === 'enable-banking' && input.aspspName?.trim().toLowerCase() === 'revolut'
	);
}

function normalizeCurrency(value: string | null | undefined): string | null {
	const normalized = value?.trim().toUpperCase();
	return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function normalizeDescription(value: string | null | undefined): string | null {
	const normalized = value?.trim().replace(/\s+/g, ' ');
	return normalized || null;
}
