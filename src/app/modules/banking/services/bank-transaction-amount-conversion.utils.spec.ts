import {
	addDays,
	convertUsingHistoricalRates,
	convertUsingProviderAmount,
	getBankTransactionRateDate,
	latestExpectedEcbRateDate,
} from './bank-transaction-amount-conversion.utils';

describe('bank transaction amount conversion', () => {
	it.each([
		['Monday before publication', '2026-09-07T08:00:00.000Z', '2026-09-04'],
		['Monday after publication', '2026-09-07T15:00:00.000Z', '2026-09-07'],
		['summer time, after publication in Berlin only', '2026-09-04T14:30:00.000Z', '2026-09-04'],
		['Saturday', '2026-09-05T12:00:00.000Z', '2026-09-04'],
		['Sunday evening', '2026-09-06T21:00:00.000Z', '2026-09-04'],
		['already Saturday in Berlin', '2026-09-04T22:30:00.000Z', '2026-09-04'],
		['winter time, before publication in Berlin', '2026-12-08T14:30:00.000Z', '2026-12-07'],
		['winter time, after publication in Berlin', '2026-12-08T15:00:00.000Z', '2026-12-08'],
	])('expects the ECB rate of the latest published business day: %s', (_scenario, now, expected) => {
		expect(latestExpectedEcbRateDate(new Date(now))).toBe(expected);
	});

	it('adds calendar days across month and year boundaries', () => {
		expect(addDays('2021-12-18', -7)).toBe('2021-12-11');
		expect(addDays('2026-01-03', -7)).toBe('2025-12-27');
	});

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
