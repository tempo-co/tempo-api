import {BankTransaction} from '../bank-transaction.entity';
import {
	createBankTransactionCategorizationInputHash,
	toBankTransactionCategorizationInput,
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
			description: 'Coffee shop',
			counterpartyName: 'Cafe',
			bankTransactionDescription: 'Card payment',
			merchantCategoryCode: '5814',
			remittanceInformation: 'Morning coffee',
		});
		expect(JSON.stringify(input)).not.toContain('provider-id');
		expect(JSON.stringify(input)).not.toContain('account-id');
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

	it.each([
		['amount', {amount: '-12.51'}],
		['direction indicator', {creditDebitIndicator: 'CRDT'}],
		['transaction type', {transactionType: 'TRANSFER'}],
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
});
