import {addDecimalStrings, createCashFlowBuckets, subtractDecimalStrings} from './bank-cash-flow.utils';

describe('cash-flow utilities', () => {
	it('creates Monday-starting weekly buckets and zero-fill dates', () => {
		expect(createCashFlowBuckets('2026-08-05', '2026-08-25', 'week')).toEqual([
			{bucketStart: '2026-08-03', startDate: '2026-08-05', endDate: '2026-08-09'},
			{bucketStart: '2026-08-10', startDate: '2026-08-10', endDate: '2026-08-16'},
			{bucketStart: '2026-08-17', startDate: '2026-08-17', endDate: '2026-08-23'},
			{bucketStart: '2026-08-24', startDate: '2026-08-24', endDate: '2026-08-25'},
		]);
	});

	it('creates calendar month and year boundaries', () => {
		expect(createCashFlowBuckets('2026-02-15', '2026-04-02', 'month')).toEqual([
			{bucketStart: '2026-02-01', startDate: '2026-02-15', endDate: '2026-02-28'},
			{bucketStart: '2026-03-01', startDate: '2026-03-01', endDate: '2026-03-31'},
			{bucketStart: '2026-04-01', startDate: '2026-04-01', endDate: '2026-04-02'},
		]);
		expect(createCashFlowBuckets('2025-06-01', '2027-02-01', 'year')).toEqual([
			{bucketStart: '2025-01-01', startDate: '2025-06-01', endDate: '2025-12-31'},
			{bucketStart: '2026-01-01', startDate: '2026-01-01', endDate: '2026-12-31'},
			{bucketStart: '2027-01-01', startDate: '2027-01-01', endDate: '2027-02-01'},
		]);
	});

	it('adds and subtracts decimal strings without floating-point drift', () => {
		expect(addDecimalStrings('999999999999999999.99', '0.02')).toBe('1000000000000000000.01');
		expect(subtractDecimalStrings('100.00', '0.125')).toBe('99.875');
		expect(subtractDecimalStrings('0.1', '0.3')).toBe('-0.2');
	});
});
