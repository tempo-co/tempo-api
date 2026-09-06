import {getBalancePreference, selectPreferredBalance} from './banking.utils';
import {EnableBankingBalance} from './enable-banking.types';

describe('getBalancePreference', () => {
	it.each([
		['CLAV', 2],
		['FWAV', 2],
		['ITAV', 2],
		['OPAV', 2],
		['AVAILABLE', 2],
		['CLBD', 1],
		['ITBD', 1],
		['OPBD', 1],
		['PRCD', 1],
		['BOOKED', 1],
		['INFO', 0],
		['OTHR', 0],
		['XPCD', 0],
		['UNKNOWN', 0],
	])('maps balance type %s to preference %s', (balanceType, expectedPreference) => {
		expect(getBalancePreference(balanceType)).toBe(expectedPreference);
	});

	it('normalizes balance type codes before looking them up', () => {
		expect(getBalancePreference(' clav ')).toBe(2);
		expect(getBalancePreference('closing_available')).toBe(2);
		expect(getBalancePreference('Booked')).toBe(1);
	});

	it('returns the neutral preference for unknown balance types', () => {
		expect(getBalancePreference('NOT_AVAILABLE')).toBe(0);
		expect(getBalancePreference('__proto__')).toBe(0);
	});
});

describe('selectPreferredBalance', () => {
	it('prefers an available closing balance over a booked closing balance', () => {
		const available: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '120.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
		};
		const booked: EnableBankingBalance = {
			balanceType: 'CLBD',
			amount: '100.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
		};

		expect(selectPreferredBalance([booked, available])).toBe(available);
		expect(selectPreferredBalance([available, booked])).toBe(available);
	});

	it('uses the latest change when duplicate balance types share a reference date', () => {
		const earlier: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '100.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
			lastChangeDateTime: '2026-08-26T10:00:00Z',
		};
		const later: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '120.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
			lastChangeDateTime: '2026-08-26T12:00:00Z',
		};

		expect(selectPreferredBalance([earlier, later])).toBe(later);
		expect(selectPreferredBalance([later, earlier])).toBe(later);
	});

	it('uses a stable field tie-breaker when duplicate balances have the same dates', () => {
		const first: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '100.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
			lastChangeDateTime: '2026-08-26T12:00:00Z',
			lastCommittedTransaction: 'transaction-1',
		};
		const second: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '100.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
			lastChangeDateTime: '2026-08-26T12:00:00Z',
			lastCommittedTransaction: 'transaction-2',
		};

		expect(selectPreferredBalance([first, second])).toBe(second);
		expect(selectPreferredBalance([second, first])).toBe(second);
	});
});
