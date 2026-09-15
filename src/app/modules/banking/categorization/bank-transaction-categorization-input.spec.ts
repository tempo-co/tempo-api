import {BankTransaction} from '../bank-transaction.entity';
import {
	createBankTransactionCategorizationInputHash,
	toBankTransactionCategorizationInput,
	toBankTransactionCategorizationWebSearchInput,
} from './bank-transaction-categorization-input';

function createTransaction(overrides: Partial<BankTransaction> = {}): BankTransaction {
	return {
		id: 'transaction-id',
		bankAccountId: 'account-id',
		providerTransactionId: 'provider-id',
		entryReference: 'entry-reference',
		dedupeKey: 'dedupe-key',
		transactionDate: '2026-09-01',
		bookingDate: '2026-09-02',
		valueDate: '2026-09-03',
		amount: '-12.50',
		currency: 'eur',
		creditDebitIndicator: 'dbit',
		transactionType: 'CARD_PAYMENT',
		transactionStatus: 'BOOK',
		bankTransactionCode: 'PMNT',
		bankTransactionSubCode: 'CARD',
		bankTransactionDescription: ' Card payment ',
		description: ' Coffee shop ',
		displayDescription: 'Coffee shop',
		counterpartyName: ' Cafe ',
		merchantCategoryCode: '5814',
		remittanceInformation: ' Morning coffee ',
		balanceAfterAmount: '100.00',
		balanceAfterCurrency: 'EUR',
		instructedAmount: '12.50',
		instructedCurrency: 'USD',
		exchangeRate: '0.9',
		exchangeRateUnitCurrency: 'USD',
		exchangeRateType: 'SPOT',
		referenceNumber: 'reference',
		referenceNumberScheme: 'RF',
		bankAccount: undefined,
		createdAt: new Date('2026-09-01T00:00:00.000Z'),
		updatedAt: new Date('2026-09-01T00:00:00.000Z'),
		...overrides,
	} as unknown as BankTransaction;
}

describe('bank transaction categorization input', () => {
	it('normalizes safe fields and derives direction without including identifiers', () => {
		const input = toBankTransactionCategorizationInput(createTransaction());

		expect(input).toEqual({
			correlationId: 'transaction-id',
			transactionDate: '2026-09-01',
			bookingDate: '2026-09-02',
			valueDate: '2026-09-03',
			amount: '-12.50',
			currency: 'EUR',
			creditDebitIndicator: 'DBIT',
			direction: 'EXPENSE',
			transactionType: 'CARD_PAYMENT',
			bankTransactionCode: 'PMNT',
			bankTransactionSubCode: 'CARD',
			description: 'Coffee shop',
			counterpartyName: 'Cafe',
			bankTransactionDescription: 'Card payment',
			merchantCategoryCode: '5814',
			remittanceInformation: 'Morning coffee',
		});
		expect(JSON.stringify(input)).not.toContain('provider-id');
		expect(JSON.stringify(input)).not.toContain('account-id');
	});

	it('re-derives the transaction type when the stored value is stale', () => {
		const input = toBankTransactionCategorizationInput(
			createTransaction({
				transactionType: 'TRANSFER',
				bankTransactionCode: '944',
				bankTransactionSubCode: null,
				bankTransactionDescription: null,
			}),
		);

		expect(input.transactionType).toBe('OTHER');
	});

	it('keeps the hash stable across insignificant text and case changes', () => {
		const first = createTransaction();
		const second = createTransaction({
			currency: ' EUR ',
			creditDebitIndicator: ' DBIT ',
			description: '  Coffee shop  ',
			counterpartyName: ' Cafe ',
			bankTransactionDescription: 'Card payment ',
			remittanceInformation: 'Morning coffee',
		});

		expect(createBankTransactionCategorizationInputHash(first)).toBe(
			createBankTransactionCategorizationInputHash(second),
		);
	});

	it('keeps the hash stable across database numeric scale normalization', () => {
		expect(createBankTransactionCategorizationInputHash(createTransaction({amount: '2.50'}))).toBe(
			createBankTransactionCategorizationInputHash(createTransaction({amount: '2.50000000'})),
		);
	});

	it('does not change the hash when only the stored type is stale', () => {
		expect(createBankTransactionCategorizationInputHash(createTransaction())).toBe(
			createBankTransactionCategorizationInputHash(createTransaction({transactionType: 'TRANSFER'})),
		);
	});

	it.each([
		['amount', {amount: '-12.51'}],
		['direction indicator', {creditDebitIndicator: 'CRDT'}],
		['bank transaction code', {bankTransactionCode: 'PMNT2'}],
		['bank transaction sub-code', {bankTransactionSubCode: 'CARD2'}],
		['transaction date', {transactionDate: '2026-09-04'}],
		['booking date', {bookingDate: '2026-09-04'}],
		['value date', {valueDate: '2026-09-04'}],
		['description', {description: 'Different description'}],
		['counterparty', {counterpartyName: 'Different counterparty'}],
		['bank transaction description', {bankTransactionDescription: 'Different bank description'}],
		['merchant category code', {merchantCategoryCode: '5999'}],
		['remittance information', {remittanceInformation: 'Different remittance'}],
	])('changes the hash when %s changes', (_field, override) => {
		expect(createBankTransactionCategorizationInputHash(createTransaction())).not.toBe(
			createBankTransactionCategorizationInputHash(createTransaction(override as Partial<BankTransaction>)),
		);
	});

	it('does not hash excluded financial and provider identity fields', () => {
		const first = createTransaction();
		const second = createTransaction({
			balanceAfterAmount: '999.00',
			instructedAmount: '99.00',
			exchangeRate: '1.2',
			referenceNumber: 'different-reference',
			bankAccountId: 'different-account',
			providerTransactionId: 'different-provider-id',
			entryReference: 'different-entry',
		});

		expect(createBankTransactionCategorizationInputHash(first)).toBe(
			createBankTransactionCategorizationInputHash(second),
		);
	});

	it('caps remittance information at 2,000 characters', () => {
		const remittanceInformation = 'x'.repeat(2_500);
		const input = toBankTransactionCategorizationInput(createTransaction({remittanceInformation}));

		expect(input.remittanceInformation).toHaveLength(2_000);
		expect(input.remittanceInformation).toBe(remittanceInformation.slice(0, 2_000));
	});

	it('redacts high-risk remittance identifiers before provider use', () => {
		const input = toBankTransactionCategorizationInput(
			createTransaction({
				remittanceInformation: 'IBAN NL91 ABNA 0417 1643 00 contact test@example.com NR:ABC123456 1234567',
			}),
		);

		expect(input.remittanceInformation).toBe('IBAN [REDACTED] contact [REDACTED] [REDACTED] [REDACTED]');
	});

	it('keeps only compact transaction context and the selected merchant name', () => {
		const input = toBankTransactionCategorizationInput(
			createTransaction({
				amount: '-39.99',
				currency: 'EUR',
				creditDebitIndicator: 'DBIT',
				bankTransactionCode: null,
				bankTransactionSubCode: null,
				counterpartyName: 'Jaemy VOF via Stichting',
				merchantCategoryCode: null,
				description: 'SEPA iDEAL IBAN: NL00TEST0123456789 Order 123456789',
				remittanceInformation: 'Order 123456789',
			}),
		);

		const result = toBankTransactionCategorizationWebSearchInput(input);

		expect(result).toEqual({
			correlationId: 'transaction-id',
			amount: '-39.99',
			currency: 'EUR',
			direction: 'EXPENSE',
			transactionType: 'OTHER',
			merchantName: 'Jaemy VOF via Stichting',
			merchantCategoryCode: null,
		});

		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('NL00TEST0123456789');
		expect(serialized).not.toContain('123456789');
		expect(serialized).not.toContain('provider-id');
		expect(serialized).not.toContain('account-id');
		expect(serialized).not.toContain('Order 123456789');
	});

	it('redacts identifiers and payment prefixes while retaining ordinary merchant words', () => {
		const result = toBankTransactionCategorizationWebSearchInput(
			toBankTransactionCategorizationInput(
				createTransaction({
					counterpartyName:
						'Google Pay ACME email@example.com IBAN NL00TEST0123456789 Order 123456789 NS Almelo 1234',
				}),
			),
		);

		expect(result?.merchantName).toBe('ACME NS Almelo');
		expect(JSON.stringify(result)).not.toMatch(/email@example\.com|NL00TEST0123456789|123456789|1234/);
	});

	it('returns null when all merchant text is empty or redacted', () => {
		const input = toBankTransactionCategorizationInput(
			createTransaction({
				counterpartyName: '',
				description: 'IBAN NL00TEST0123456789 Order 123456789',
				bankTransactionDescription: 'Card payment',
			}),
		);

		expect(toBankTransactionCategorizationWebSearchInput(input)).toBeNull();
	});
});
