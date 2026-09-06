export const BANK_TRANSACTION_TYPES = {
	CARD_PAYMENT: 'CARD_PAYMENT',
	TRANSFER: 'TRANSFER',
	DIRECT_DEBIT: 'DIRECT_DEBIT',
	CASH_WITHDRAWAL: 'CASH_WITHDRAWAL',
	FEE: 'FEE',
	INTEREST: 'INTEREST',
	SALARY: 'SALARY',
	REFUND: 'REFUND',
	OTHER: 'OTHER',
} as const;

export type BankTransactionType = (typeof BANK_TRANSACTION_TYPES)[keyof typeof BANK_TRANSACTION_TYPES];

type BankTransactionClassification = {
	code?: string;
	subCode?: string;
	description?: string;
};

const STRUCTURED_CODE_TYPES: Record<string, BankTransactionType> = {
	CARD: BANK_TRANSACTION_TYPES.CARD_PAYMENT,
	CARD_PAYMENT: BANK_TRANSACTION_TYPES.CARD_PAYMENT,
	CCRD: BANK_TRANSACTION_TYPES.CARD_PAYMENT,
	POS: BANK_TRANSACTION_TYPES.CARD_PAYMENT,
	POSD: BANK_TRANSACTION_TYPES.CARD_PAYMENT,
	TRANSFER: BANK_TRANSACTION_TYPES.TRANSFER,
	TRF: BANK_TRANSACTION_TYPES.TRANSFER,
	ESCT: BANK_TRANSACTION_TYPES.TRANSFER,
	ICDT: BANK_TRANSACTION_TYPES.TRANSFER,
	ITRF: BANK_TRANSACTION_TYPES.TRANSFER,
	RCDT: BANK_TRANSACTION_TYPES.TRANSFER,
	DIRECT_DEBIT: BANK_TRANSACTION_TYPES.DIRECT_DEBIT,
	DD: BANK_TRANSACTION_TYPES.DIRECT_DEBIT,
	IDDT: BANK_TRANSACTION_TYPES.DIRECT_DEBIT,
	RDDT: BANK_TRANSACTION_TYPES.DIRECT_DEBIT,
	FEE: BANK_TRANSACTION_TYPES.FEE,
	CHRG: BANK_TRANSACTION_TYPES.FEE,
	COMM: BANK_TRANSACTION_TYPES.FEE,
	COME: BANK_TRANSACTION_TYPES.FEE,
	INTEREST: BANK_TRANSACTION_TYPES.INTEREST,
	INT: BANK_TRANSACTION_TYPES.INTEREST,
	INTR: BANK_TRANSACTION_TYPES.INTEREST,
	SALARY: BANK_TRANSACTION_TYPES.SALARY,
	SALA: BANK_TRANSACTION_TYPES.SALARY,
	REFUND: BANK_TRANSACTION_TYPES.REFUND,
	RIMB: BANK_TRANSACTION_TYPES.REFUND,
	CASH_WITHDRAWAL: BANK_TRANSACTION_TYPES.CASH_WITHDRAWAL,
	ATM: BANK_TRANSACTION_TYPES.CASH_WITHDRAWAL,
	CWDL: BANK_TRANSACTION_TYPES.CASH_WITHDRAWAL,
	WITHDRAWAL: BANK_TRANSACTION_TYPES.CASH_WITHDRAWAL,
};

// Rules are ordered from the most specific/highest-priority description to the least specific.
const FREE_FORM_CLASSIFIERS: ReadonlyArray<readonly [BankTransactionType, RegExp]> = [
	[BANK_TRANSACTION_TYPES.DIRECT_DEBIT, /\b(?:direct\s+debit|incasso|machtiging)\b/],
	[BANK_TRANSACTION_TYPES.CASH_WITHDRAWAL, /\b(?:atm|cash\s+withdrawal|withdrawal|geldopname)\b/],
	[BANK_TRANSACTION_TYPES.FEE, /\b(?:fee|charge|commission|kosten|provisie)\b/],
	[BANK_TRANSACTION_TYPES.INTEREST, /\b(?:interest|rente)\b/],
	[BANK_TRANSACTION_TYPES.SALARY, /\b(?:salary|payroll|wage|salaris|loon)\b/],
	[BANK_TRANSACTION_TYPES.REFUND, /\b(?:refund|reimburse|terugbetaling|reversal)\b/],
	[BANK_TRANSACTION_TYPES.CARD_PAYMENT, /\b(?:card|kaart|pos|purchase|merchant)\b/],
	[BANK_TRANSACTION_TYPES.TRANSFER, /\b(?:transfer|overboeking|overschrijving|wire|sepa)\b/],
];

export function normalizeBankTransactionType({
	code,
	subCode,
	description,
}: BankTransactionClassification): BankTransactionType {
	// Enable Banking's structured code is authoritative when it maps to a known type.
	const structuredType = [subCode, code]
		.map((value) => value?.trim().toUpperCase())
		.map((value) => (value ? STRUCTURED_CODE_TYPES[value] : undefined))
		.find((type): type is BankTransactionType => type !== undefined);
	if (structuredType) return structuredType;

	const freeFormClassification = description?.toLowerCase() ?? '';
	for (const [type, pattern] of FREE_FORM_CLASSIFIERS) {
		if (pattern.test(freeFormClassification)) return type;
	}

	return BANK_TRANSACTION_TYPES.OTHER;
}
