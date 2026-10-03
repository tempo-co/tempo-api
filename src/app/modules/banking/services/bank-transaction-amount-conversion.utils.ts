import {addDays} from '../banking.utils';

/** The longest span between consecutive ECB publications: Easter, or Christmas next to a weekend. */
export const MAX_ECB_PUBLICATION_GAP_DAYS = 5;

/**
 * The oldest reference rate a conversion may use, in days before the transaction date: the longest ECB
 * publication gap ({@link MAX_ECB_PUBLICATION_GAP_DAYS}) plus a margin. Also the lookback when fetching a range.
 */
export const FX_RATE_MAX_AGE_DAYS = 7;

/**
 * Transaction columns a stored base amount is derived from, with their Postgres types. When any of them changes,
 * the stored amount is stale: sync clears it and the conversion re-checks them before writing.
 */
export const BASE_AMOUNT_INPUT_COLUMNS = [
	['amount', 'numeric'],
	['currency', 'varchar'],
	['transactionDate', 'date'],
	['bookingDate', 'date'],
	['instructedAmount', 'numeric'],
	['instructedCurrency', 'varchar'],
] as const;

/** `ROW(...)` of the base amount inputs of the given table alias, for comparing them as one value. */
export function baseAmountInputsSql(alias: string): string {
	return `ROW(${BASE_AMOUNT_INPUT_COLUMNS.map(([column]) => `${alias}."${column}"`).join(', ')})`;
}

/** ECB reference rates are published around 16:00 CET on TARGET business days. */
const ECB_PUBLICATION_HOUR = 16;
const ECB_TIME_ZONE = 'Europe/Berlin';

/** The newest ECB rate date that should already be published at `now`. ECB holidays are not modelled. */
export function latestExpectedEcbRateDate(now: Date): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: ECB_TIME_ZONE,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			hourCycle: 'h23',
		})
			.formatToParts(now)
			.map(({type, value}) => [type, value]),
	);
	const localDate = `${parts.year}-${parts.month}-${parts.day}`;
	if (isBusinessDay(localDate) && Number(parts.hour) >= ECB_PUBLICATION_HOUR) return localDate;

	return toWeekday(addDays(localDate, -1), -1);
}

/** The date itself when it is a weekday, otherwise the nearest weekday in the given direction. */
export function toWeekday(date: string, direction: 1 | -1): string {
	let candidate = date;
	while (!isBusinessDay(candidate)) candidate = addDays(candidate, direction);
	return candidate;
}

function isBusinessDay(date: string): boolean {
	const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
	return weekday >= 1 && weekday <= 5;
}

export function normalizeCurrency(value: string | null | undefined): string | null {
	const normalized = value?.trim().toUpperCase();
	return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}
