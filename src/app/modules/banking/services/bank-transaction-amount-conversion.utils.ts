const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

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

function isBusinessDay(date: string): boolean {
	const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
	return weekday >= 1 && weekday <= 5;
}

export function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00.000Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

export type BankTransactionAmountConversionInput = {
	amount: string;
	currency: string;
	baseCurrency: string;
	instructedAmount?: string | null;
	instructedCurrency?: string | null;
};

export function getBankTransactionRateDate(
	transactionDate: string | null | undefined,
	bookingDate: string | null | undefined,
): string | null {
	return transactionDate ?? bookingDate ?? null;
}

export function convertUsingProviderAmount(input: BankTransactionAmountConversionInput): string | null {
	const amount = parseDecimal(input.amount);
	const currency = normalizeCurrency(input.currency);
	const baseCurrency = normalizeCurrency(input.baseCurrency);
	if (amount === null || !currency || !baseCurrency) return null;
	if (currency === baseCurrency) return formatDecimal(amount);

	const instructedAmount = parseDecimal(input.instructedAmount);
	const instructedCurrency = normalizeCurrency(input.instructedCurrency);
	if (instructedAmount !== null && instructedCurrency === baseCurrency) {
		return formatDecimal(Math.sign(amount) * Math.abs(instructedAmount));
	}

	return null;
}

export function convertUsingHistoricalRates(
	amount: string,
	currency: string,
	baseCurrency: string,
	sourceRateToEur: number | null,
	baseRateToEur: number | null,
): string | null {
	const parsedAmount = parseDecimal(amount);
	const normalizedCurrency = normalizeCurrency(currency);
	const normalizedBaseCurrency = normalizeCurrency(baseCurrency);
	if (parsedAmount === null || !normalizedCurrency || !normalizedBaseCurrency) return null;
	if (normalizedCurrency === normalizedBaseCurrency) return formatDecimal(parsedAmount);

	const sourceRate = normalizedCurrency === 'EUR' ? 1 : sourceRateToEur;
	const baseRate = normalizedBaseCurrency === 'EUR' ? 1 : baseRateToEur;
	if (sourceRate === null || baseRate === null || sourceRate <= 0 || baseRate <= 0) return null;

	return formatDecimal((parsedAmount / sourceRate) * baseRate);
}

export function normalizeCurrency(value: string | null | undefined): string | null {
	const normalized = value?.trim().toUpperCase();
	return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function parseDecimal(value: string | null | undefined): number | null {
	if (!value || !DECIMAL_PATTERN.test(value.trim())) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimal(value: number): string {
	if (!Number.isFinite(value)) return '0';
	const rounded = Number(value.toFixed(12));
	return Object.is(rounded, -0) ? '0' : String(rounded);
}
