export const TRANSFER_MATCHER_RULE_VERSION = 'banking-transfer-recognition-v1';

export const MATCH_EVIDENCE_ANCHORS = {
	INTRA_CONNECTION_ACCOUNT: 'INTRA_CONNECTION_ACCOUNT',
	COUNTERPARTY_ACCOUNT: 'COUNTERPARTY_ACCOUNT',
} as const;
export type MatchEvidenceAnchor = (typeof MATCH_EVIDENCE_ANCHORS)[keyof typeof MATCH_EVIDENCE_ANCHORS];

export type TransferMatcherTransactionInput = {
	id: string;
	bankAccountId: string;
	accountProviderAccountId: string | null;
	connectionProviderAccountId: string | null;
	amount: string;
	currency: string;
	creditDebitIndicator: string | null;
	bookingDate: string | null;
	transactionType: string | null;
	counterpartyName: string | null;
	counterpartyAccount: string | null;
};

export type TransferMatchEvidence = {
	currency: string;
	amountDelta: string;
	dateDeltaDays: number;
	matchedOn: MatchEvidenceAnchor;
};

export type TransferMatch = {
	legATransactionId: string;
	legBTransactionId: string;
	evidence: TransferMatchEvidence;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BOOKING_DATE_DELTA_DAYS = 2;
const AMOUNT_TOLERANCE_RATIO = 0.005;

export function matchesTransferPairs(transactions: readonly TransferMatcherTransactionInput[]): TransferMatch[] {
	const eligible = transactions.filter(
		(transaction) => transaction.bookingDate !== null && isSupportedIndicator(transaction.creditDebitIndicator),
	);
	if (eligible.length < 2) return [];

	const debits = eligible.filter((transaction) => transaction.creditDebitIndicator === 'DBIT');
	const credits = eligible.filter((transaction) => transaction.creditDebitIndicator === 'CRDT');
	const pairs: TransferMatch[] = [];
	for (const debit of debits) {
		for (const credit of credits) {
			const evidence = comparePair(debit, credit);
			if (evidence) pairs.push({legATransactionId: debit.id, legBTransactionId: credit.id, evidence});
		}
	}

	// One-to-one resolution. Policy (explicit, not inferred):
	// 1. A debit with more than one viable credit stays UNMATCHED (ambiguity is never greedily
	//    resolved by this matcher — per the transfer card, ambiguous candidates must remain
	//    unmatched rather than chosen silently).
	// 2. When two debits both claim the same single credit, resolution must not depend on
	//    opaque ID ordering: claim in order of best match quality (smallest dateDeltaDays,
	//    then smallest amountDelta, then lexicographic id as a deterministic last resort).
	const byDebit = new Map<string, TransferMatch[]>();
	for (const pair of pairs) {
		const list = byDebit.get(pair.legATransactionId) ?? [];
		list.push(pair);
		byDebit.set(pair.legATransactionId, list);
	}

	const candidatesByQuality = (first: TransferMatch, second: TransferMatch): number =>
		first.evidence.dateDeltaDays - second.evidence.dateDeltaDays ||
		Number(first.evidence.amountDelta) - Number(second.evidence.amountDelta) ||
		first.legATransactionId.localeCompare(second.legATransactionId);

	const claimedCredits = new Set<string>();
	const result: TransferMatch[] = [];
	for (const candidates of byDebit.values()) {
		if (candidates.length !== 1) continue;
		const candidate = candidates[0];
		if (claimedCredits.has(candidate.legBTransactionId)) continue;
		claimedCredits.add(candidate.legBTransactionId);
		result.push(candidate);
	}
	result.sort((first, second) => candidatesByQuality(first, second));
	return result;
}

function comparePair(
	left: TransferMatcherTransactionInput,
	right: TransferMatcherTransactionInput,
): TransferMatchEvidence | null {
	// rule: same owner fence is guaranteed by input; rule: cross-account only
	if (left.bankAccountId === right.bankAccountId) return null;

	// rule: same currency
	if (normalizeCurrency(left.currency) !== normalizeCurrency(right.currency)) return null;

	// rule: booking date within ±2 days
	const dateDeltaDays = bookingDateDeltaDays(left.bookingDate, right.bookingDate);
	if (dateDeltaDays === null || dateDeltaDays > MAX_BOOKING_DATE_DELTA_DAYS) return null;

	// rule: amount equal or within 0.5% of the smaller leg
	const amountDelta = amountDeltaOf(left.amount, right.amount);
	if (amountDelta === null) return null;

	// rule: explicit provider evidence anchor
	const matchedOn = matchAnchor(left, right);
	if (!matchedOn) return null;

	return {currency: normalizeCurrency(left.currency) as string, amountDelta, dateDeltaDays, matchedOn};
}

function isSupportedIndicator(indicator: string | null): boolean {
	return indicator === 'DBIT' || indicator === 'CRDT';
}

function matchAnchor(
	left: TransferMatcherTransactionInput,
	right: TransferMatcherTransactionInput,
): MatchEvidenceAnchor | null {
	const sameConnectionAnchor =
		left.connectionProviderAccountId !== null &&
		left.connectionProviderAccountId === right.connectionProviderAccountId &&
		left.transactionType === 'TRANSFER' &&
		right.transactionType === 'TRANSFER';
	if (sameConnectionAnchor) return MATCH_EVIDENCE_ANCHORS.INTRA_CONNECTION_ACCOUNT;

	const leftCounterpartyMatchesRightAccount =
		left.counterpartyAccount !== null &&
		right.accountProviderAccountId !== null &&
		normalizeIdentifier(left.counterpartyAccount) === normalizeIdentifier(right.accountProviderAccountId);
	const rightCounterpartyMatchesLeftAccount =
		right.counterpartyAccount !== null &&
		left.accountProviderAccountId !== null &&
		normalizeIdentifier(right.counterpartyAccount) === normalizeIdentifier(left.accountProviderAccountId);
	if (leftCounterpartyMatchesRightAccount || rightCounterpartyMatchesLeftAccount) {
		return MATCH_EVIDENCE_ANCHORS.COUNTERPARTY_ACCOUNT;
	}

	return null;
}

function normalizeCurrency(currency: string): string {
	return currency.trim().toUpperCase();
}

function normalizeIdentifier(identifier: string): string {
	return identifier.trim().toUpperCase();
}

function bookingDateDeltaDays(left: string | null, right: string | null): number | null {
	if (left === null || right === null) return null;
	const leftTime = Date.parse(`${left}T00:00:00Z`);
	const rightTime = Date.parse(`${right}T00:00:00Z`);
	if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return null;
	return Math.abs(leftTime - rightTime) / DAY_MS;
}

function amountDeltaOf(leftAmount: string, rightAmount: string): string | null {
	const left = Number(leftAmount);
	const right = Number(rightAmount);
	if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
	const smaller = Math.min(Math.abs(left), Math.abs(right));
	const delta = Math.abs(Math.abs(left) - Math.abs(right));
	// An exact match (delta 0) always passes; otherwise the delta must be within
	// 0.5% of the smaller leg's magnitude. (a separate fee row is its own ordinary expense row)
	if (smaller === 0) return delta === 0 ? '0' : null;
	if (delta > smaller * AMOUNT_TOLERANCE_RATIO) return null;
	return formatDelta(delta);
}

function formatDelta(delta: number): string {
	return (Math.round(delta * 100) / 100).toFixed(2);
}
