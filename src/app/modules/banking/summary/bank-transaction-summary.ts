/**
 * Pure monthly spending math for the Home summary. Money is integer cents (`bigint`) throughout; amounts enter as
 * Postgres decimal strings with at most two decimals and leave through {@link formatCents}. No floats.
 */

/** Spending of one calendar month, keyed by day of month. */
export type DailyCents = ReadonlyMap<number, bigint>;

export type SpendingPaceInput = {
	daysInMonth: number;
	/** Last day of the viewed month that counts (the client's today in the current month). */
	throughDay: number;
	daily: DailyCents;
	/** Earlier months to compare with, each with its own length so shorter months stop at their last day. */
	baseline: ReadonlyArray<{days: number; daily: DailyCents}>;
};

export type SpendingPaceDay = {day: number; spending: string; cumulative: string};
export type BaselineDay = {day: number; average: string; low: string | null; high: string | null};

export function buildSpendingPace(input: SpendingPaceInput): {daily: SpendingPaceDay[]; baseline: BaselineDay[]} {
	let cumulative = 0n;
	const daily = days(input.throughDay).map((day) => {
		const spending = input.daily.get(day) ?? 0n;
		cumulative += spending;
		return {day, spending: formatCents(spending), cumulative: formatCents(cumulative)};
	});

	if (input.baseline.length === 0) return {daily, baseline: []};
	const cumulativeByMonth = input.baseline.map((month) => cumulativeSeries(month.daily, month.days));
	const baseline = days(input.daysInMonth).map((day) => {
		const totals = cumulativeByMonth.map((series) => series[Math.min(day, series.length) - 1]);
		const hasBand = totals.length > 1;
		return {
			day,
			average: formatCents(averageCents(totals)),
			low: hasBand ? formatCents(totals.reduce((min, value) => (value < min ? value : min))) : null,
			high: hasBand ? formatCents(totals.reduce((max, value) => (value > max ? value : max))) : null,
		};
	});
	return {daily, baseline};
}

/** The `count` calendar months before `month` (`YYYY-MM`), oldest first. */
export function previousMonths(month: string, count: number): string[] {
	const [year, monthNumber] = month.split('-').map(Number);
	return Array.from({length: count}, (_, index) =>
		new Date(Date.UTC(year, monthNumber - 1 - (count - index), 1)).toISOString().slice(0, 7),
	);
}

export function daysInMonth(month: string): number {
	const [year, monthNumber] = month.split('-').map(Number);
	return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Parses a decimal string with at most two decimals, as returned by `ROUND(..., 2)::text`. */
export function parseCents(value: string): bigint {
	const match = DECIMAL_PATTERN.exec(value);
	if (!match) throw new Error(`Not a two-decimal amount: ${value}`);
	const [, sign, whole, fraction = ''] = match;
	const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
	return sign ? -cents : cents;
}

export function formatCents(value: bigint): string {
	const absolute = value < 0n ? -value : value;
	const fraction = (absolute % 100n).toString().padStart(2, '0');
	return `${value < 0n ? '-' : ''}${absolute / 100n}.${fraction}`;
}

/** Mean in whole cents, rounded half away from zero like Postgres `ROUND`. */
export function averageCents(values: readonly bigint[]): bigint {
	const count = BigInt(values.length);
	const total = values.reduce((sum, value) => sum + value, 0n);
	const absolute = total < 0n ? -total : total;
	const rounded = (absolute * 2n + count) / (count * 2n);
	return total < 0n ? -rounded : rounded;
}

function cumulativeSeries(daily: DailyCents, monthDays: number): bigint[] {
	let total = 0n;
	return days(monthDays).map((day) => (total += daily.get(day) ?? 0n));
}

function days(count: number): number[] {
	return Array.from({length: count}, (_, index) => index + 1);
}
