export type BankCashFlowGranularity = 'week' | 'month' | 'year';

export type CashFlowBucket = {
	bucketStart: string;
	startDate: string;
	endDate: string;
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function createCashFlowBuckets(
	from: string,
	to: string,
	granularity: BankCashFlowGranularity,
): CashFlowBucket[] {
	const fromDate = parseDateOnly(from);
	const toDate = parseDateOnly(to);
	if (from > to) throw new RangeError('Cash-flow range must start before it ends.');

	const firstBucket = startOfBucket(fromDate, granularity);
	const lastBucket = startOfBucket(toDate, granularity);
	const buckets: CashFlowBucket[] = [];

	for (let bucket = firstBucket; bucket.getTime() <= lastBucket.getTime(); bucket = addBucket(bucket, granularity)) {
		const nextBucket = addBucket(bucket, granularity);
		const fullBucketStart = formatDate(bucket);
		const fullBucketEnd = formatDate(addDays(nextBucket, -1));
		buckets.push({
			bucketStart: fullBucketStart,
			startDate: fullBucketStart < from ? from : fullBucketStart,
			endDate: fullBucketEnd > to ? to : fullBucketEnd,
		});
	}

	return buckets;
}

export function normalizeDecimal(value: string): string {
	const {negative, digits, scale} = parseDecimal(value);
	return formatDecimal(negative ? -digits : digits, scale);
}

export function addDecimalStrings(left: string, right: string): string {
	const leftDecimal = parseDecimal(left);
	const rightDecimal = parseDecimal(right);
	const scale = Math.max(leftDecimal.scale, rightDecimal.scale);
	const leftValue =
		(leftDecimal.negative ? -leftDecimal.digits : leftDecimal.digits) * scaleMultiplier(scale - leftDecimal.scale);
	const rightValue =
		(rightDecimal.negative ? -rightDecimal.digits : rightDecimal.digits) *
		scaleMultiplier(scale - rightDecimal.scale);
	return formatDecimal(leftValue + rightValue, scale);
}

export function subtractDecimalStrings(left: string, right: string): string {
	const normalizedRight = normalizeDecimal(right);
	return addDecimalStrings(left, normalizedRight.startsWith('-') ? normalizedRight.slice(1) : `-${normalizedRight}`);
}

function parseDateOnly(value: string): Date {
	const match = DATE_PATTERN.exec(value);
	if (!match) throw new RangeError('Cash-flow dates must use YYYY-MM-DD.');
	const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
	if (formatDate(date) !== value) throw new RangeError('Cash-flow date is invalid.');
	return date;
}

function startOfBucket(date: Date, granularity: BankCashFlowGranularity): Date {
	const result = new Date(date.getTime());
	if (granularity === 'week') {
		const mondayOffset = (result.getUTCDay() + 6) % 7;
		return addDays(result, -mondayOffset);
	}
	if (granularity === 'month') result.setUTCDate(1);
	if (granularity === 'year') {
		result.setUTCMonth(0, 1);
	}
	return result;
}

function addBucket(date: Date, granularity: BankCashFlowGranularity): Date {
	const result = new Date(date.getTime());
	if (granularity === 'week') return addDays(result, 7);
	if (granularity === 'month') result.setUTCMonth(result.getUTCMonth() + 1);
	if (granularity === 'year') result.setUTCFullYear(result.getUTCFullYear() + 1);
	return result;
}

function addDays(date: Date, days: number): Date {
	const result = new Date(date.getTime());
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

type DecimalParts = {
	negative: boolean;
	digits: bigint;
	scale: number;
};

function parseDecimal(value: string): DecimalParts {
	const trimmed = value.trim();
	if (!/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) throw new RangeError('Invalid decimal value.');
	const negative = trimmed.startsWith('-');
	const unsigned = trimmed.replace(/^[+-]/, '');
	const [integerPart, fractionPart = ''] = unsigned.split('.');
	return {
		negative,
		digits: BigInt(`${integerPart}${fractionPart}`),
		scale: fractionPart.length,
	};
}

function scaleMultiplier(scale: number): bigint {
	return 10n ** BigInt(scale);
}

function formatDecimal(value: bigint, scale: number): string {
	const negative = value < 0n;
	const absolute = (negative ? -value : value).toString().padStart(scale + 1, '0');
	const integerPart = scale === 0 ? absolute : absolute.slice(0, -scale);
	const fractionPart = scale === 0 ? '' : absolute.slice(-scale).replace(/0+$/, '');
	const magnitude = fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
	return negative && magnitude !== '0' ? `-${magnitude}` : magnitude;
}
