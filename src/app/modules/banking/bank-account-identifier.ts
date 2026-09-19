export const BANK_ACCOUNT_IDENTIFIER_SCHEMES = {
	IBAN: 'IBAN',
	BBAN: 'BBAN',
} as const;

export type BankAccountIdentifier = {
	scheme: (typeof BANK_ACCOUNT_IDENTIFIER_SCHEMES)[keyof typeof BANK_ACCOUNT_IDENTIFIER_SCHEMES];
	value: string;
};

export function normalizeBankAccountIdentifier(scheme: unknown, value: unknown): BankAccountIdentifier | null {
	if (typeof scheme !== 'string' || typeof value !== 'string') return null;

	const normalizedScheme = scheme.trim().toUpperCase();
	if (!(normalizedScheme in BANK_ACCOUNT_IDENTIFIER_SCHEMES)) return null;

	const normalizedValue = value.replace(/\s+/g, '').toUpperCase();
	if (!normalizedValue || !/^[A-Z0-9]+$/.test(normalizedValue)) return null;

	if (
		normalizedScheme === BANK_ACCOUNT_IDENTIFIER_SCHEMES.IBAN &&
		(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normalizedValue) || normalizedValue.length > 34)
	) {
		return null;
	}
	if (
		normalizedScheme === BANK_ACCOUNT_IDENTIFIER_SCHEMES.BBAN &&
		(normalizedValue.length < 4 || normalizedValue.length > 34)
	) {
		return null;
	}

	return {scheme: normalizedScheme as BankAccountIdentifier['scheme'], value: normalizedValue};
}

export function bankAccountIdentifiersEqual(
	left: BankAccountIdentifier | null | undefined,
	right: BankAccountIdentifier | null | undefined,
): boolean {
	return Boolean(left && right && left.scheme === right.scheme && left.value === right.value);
}
