import {
	convertUsingHistoricalRates,
	convertUsingProviderAmount,
	getBankTransactionRateDate,
} from './bank-transaction-amount-conversion.utils';

describe('bank transaction amount conversion', () => {
	it('keeps an amount unchanged when it already uses the account base currency', () => {
		expect(convertUsingProviderAmount({amount: '-100.00', currency: 'eur', baseCurrency: 'EUR'})).toBe('-100');
	});

	it('prefers a provider instructed amount in the account base currency', () => {
		expect(
			convertUsingProviderAmount({
				amount: '-100.00',
				currency: 'RON',
				baseCurrency: 'EUR',
				instructedAmount: '20.00',
				instructedCurrency: 'EUR',
			}),
		).toBe('-20');
	});

	it('does not use ambiguous exchange-rate metadata without an instructed amount', () => {
		expect(
			convertUsingProviderAmount({
				amount: '100',
				currency: 'USD',
				baseCurrency: 'EUR',
			}),
		).toBeNull();
	});

	it('converts through the persisted EUR reference rates', () => {
		expect(convertUsingHistoricalRates('100', 'GBP', 'RON', 0.85, 4.95)).toBe('582.352941176471');
		expect(convertUsingHistoricalRates('100', 'GBP', 'EUR', 0.85, null)).toBe('117.647058823529');
	});

	it('leaves a transaction unavailable when a required historical rate is missing', () => {
		expect(convertUsingHistoricalRates('100', 'GBP', 'RON', null, 4.95)).toBeNull();
		expect(convertUsingHistoricalRates('100', 'GBP', 'RON', 0.85, null)).toBeNull();
	});

	it('uses transactionDate before bookingDate for historical lookup', () => {
		expect(getBankTransactionRateDate('2026-08-24', '2026-08-26')).toBe('2026-08-24');
		expect(getBankTransactionRateDate(null, '2026-08-26')).toBe('2026-08-26');
		expect(getBankTransactionRateDate(null, null)).toBeNull();
	});
});
