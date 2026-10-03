/** How `amountInBaseCurrency` was derived: copied, taken from the bank's instructed amount, or via ECB rates. */
export const BANK_TRANSACTION_BASE_AMOUNT_METHODS = ['SAME', 'INSTRUCTED', 'ECB'] as const;
export type BankTransactionBaseAmountMethod = (typeof BANK_TRANSACTION_BASE_AMOUNT_METHODS)[number];

/**
 * The oldest reference rate a conversion may use, in days before the transaction date. It spans the longest
 * ECB publication gap (a holiday weekend) and is also the lookback when fetching rates for a date range.
 */
export const FX_RATE_MAX_AGE_DAYS = 7;

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

	let candidate = addDays(localDate, -1);
	while (!isBusinessDay(candidate)) candidate = addDays(candidate, -1);
	return candidate;
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

export function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00.000Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

export function normalizeCurrency(value: string | null | undefined): string | null {
	const normalized = value?.trim().toUpperCase();
	return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}
