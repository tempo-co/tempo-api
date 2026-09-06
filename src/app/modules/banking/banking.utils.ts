import {EnableBankingBalance} from './enable-banking.types';

const AVAILABLE_BALANCE_PREFERENCE = 2;
const BOOKED_BALANCE_PREFERENCE = 1;
const UNKNOWN_BALANCE_PREFERENCE = 0;

const BALANCE_PREFERENCES: Readonly<Record<string, number>> = {
	AVAILABLE: AVAILABLE_BALANCE_PREFERENCE,
	AVAILABLEBALANCE: AVAILABLE_BALANCE_PREFERENCE,
	CLAV: AVAILABLE_BALANCE_PREFERENCE,
	CLOSINGAVAILABLE: AVAILABLE_BALANCE_PREFERENCE,
	FORWARDAVAILABLE: AVAILABLE_BALANCE_PREFERENCE,
	FWAV: AVAILABLE_BALANCE_PREFERENCE,
	INTERIMAVAILABLE: AVAILABLE_BALANCE_PREFERENCE,
	ITAV: AVAILABLE_BALANCE_PREFERENCE,
	OPAV: AVAILABLE_BALANCE_PREFERENCE,
	OPENINGAVAILABLE: AVAILABLE_BALANCE_PREFERENCE,
	BOOKED: BOOKED_BALANCE_PREFERENCE,
	BOOKEDBALANCE: BOOKED_BALANCE_PREFERENCE,
	CLBD: BOOKED_BALANCE_PREFERENCE,
	CLOSINGBOOKED: BOOKED_BALANCE_PREFERENCE,
	INTERIMBOOKED: BOOKED_BALANCE_PREFERENCE,
	ITBD: BOOKED_BALANCE_PREFERENCE,
	OPBD: BOOKED_BALANCE_PREFERENCE,
	OPENINGBOOKED: BOOKED_BALANCE_PREFERENCE,
	PRCD: BOOKED_BALANCE_PREFERENCE,
	INFO: UNKNOWN_BALANCE_PREFERENCE,
	OTHR: UNKNOWN_BALANCE_PREFERENCE,
	XPCD: UNKNOWN_BALANCE_PREFERENCE,
};

export function getBalancePreference(balanceType: string): number {
	const normalizedType = balanceType
		.trim()
		.toUpperCase()
		.replace(/[\s_-]+/g, '');
	const preference = BALANCE_PREFERENCES[normalizedType];
	return typeof preference === 'number' ? preference : UNKNOWN_BALANCE_PREFERENCE;
}

function compareDescending(left: string, right: string): number {
	if (left === right) return 0;
	return left > right ? -1 : 1;
}

function getBalanceTieBreaker(balance: EnableBankingBalance): string {
	return JSON.stringify([
		balance.balanceType,
		balance.amount,
		balance.currency,
		balance.name ?? '',
		balance.lastChangeDateTime ?? '',
		balance.referenceDate ?? '',
		balance.lastCommittedTransaction ?? '',
	]);
}

export function selectPreferredBalance(balances: EnableBankingBalance[]): EnableBankingBalance | undefined {
	return [...balances].sort((left, right) => {
		const preferenceDifference = getBalancePreference(right.balanceType) - getBalancePreference(left.balanceType);
		if (preferenceDifference !== 0) return preferenceDifference;

		const referenceDateDifference = compareDescending(left.referenceDate ?? '', right.referenceDate ?? '');
		if (referenceDateDifference !== 0) return referenceDateDifference;

		const lastChangeDifference = compareDescending(left.lastChangeDateTime ?? '', right.lastChangeDateTime ?? '');
		if (lastChangeDifference !== 0) return lastChangeDifference;

		return compareDescending(getBalanceTieBreaker(left), getBalanceTieBreaker(right));
	})[0];
}

export function truncate(value: string | null | undefined, length: number): string | null {
	return value ? value.slice(0, length) : null;
}
