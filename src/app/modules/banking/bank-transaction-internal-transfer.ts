import {type BankAccountIdentifier, bankAccountIdentifiersEqual} from './bank-account-identifier';

export const BANK_TRANSACTION_INTERNAL_TRANSFER_MATCH_EVIDENCE = {
	COUNTERPARTY_ACCOUNT: 'COUNTERPARTY_ACCOUNT',
	SAME_CONNECTION_TRANSFER: 'SAME_CONNECTION_TRANSFER',
	OWNER_IDENTITY_PROVIDER_MARKER: 'OWNER_IDENTITY_PROVIDER_MARKER',
} as const;

type BankTransactionInternalTransferMatchEvidence =
	(typeof BANK_TRANSACTION_INTERNAL_TRANSFER_MATCH_EVIDENCE)[keyof typeof BANK_TRANSACTION_INTERNAL_TRANSFER_MATCH_EVIDENCE];

export type BankTransactionInternalTransferCandidate = {
	id: string;
	ownerId: string;
	ownerName: string | null;
	bankConnectionId: string;
	bankAccountId: string;
	accountIdentifier: BankAccountIdentifier | null;
	counterpartyAccountIdentifier: BankAccountIdentifier | null;
	aspspName: string | null;
	description: string | null;
	counterpartyName: string | null;
	remittanceInformation: string | null;
	bankTransactionDescription: string | null;
	amount: string;
	currency: string;
	creditDebitIndicator: string | null;
	transactionStatus: string | null;
	transactionType: string | null;
	bookingDate: string | null;
	financialEventType: string | null;
};

export type BankTransactionInternalTransferMatch = {
	transactionIds: [string, string];
	evidence: BankTransactionInternalTransferMatchEvidence;
};

const AMOUNT_SCALE = 8;
const AMOUNT_SCALE_FACTOR = 10n ** BigInt(AMOUNT_SCALE);
const INTERNAL_TRANSFER_TYPE = 'INTERNAL_TRANSFER';
const BOOKED_STATUSES = new Set(['BOOK', 'COMPLETED']);
const TRANSFER_TYPE = 'TRANSFER';
const SCT_INCOMING_BANK_TRANSACTION_DESCRIPTION = 'SCT INCOMING';

export function matchBankTransactionInternalTransfers(
	transactions: readonly BankTransactionInternalTransferCandidate[],
): BankTransactionInternalTransferMatch[] {
	const candidateIds = new Map<string, Set<string>>();
	const evidenceByPair = new Map<string, BankTransactionInternalTransferMatchEvidence>();

	for (let leftIndex = 0; leftIndex < transactions.length; leftIndex += 1) {
		const left = transactions[leftIndex];
		if (!isEligible(left)) continue;

		for (let rightIndex = leftIndex + 1; rightIndex < transactions.length; rightIndex += 1) {
			const right = transactions[rightIndex];
			if (!isEligible(right) || !isCompatible(left, right)) continue;

			const evidence = getEvidence(left, right);
			if (!evidence) continue;

			const pairKey = [left.id, right.id].sort().join(':');
			evidenceByPair.set(pairKey, evidence);
			addCandidate(candidateIds, left.id, right.id);
			addCandidate(candidateIds, right.id, left.id);
		}
	}

	return [...evidenceByPair.entries()]
		.filter(([pairKey]) => {
			const [leftId, rightId] = pairKey.split(':');
			return candidateIds.get(leftId)?.size === 1 && candidateIds.get(rightId)?.size === 1;
		})
		.map(([pairKey, evidence]) => {
			const [leftId, rightId] = pairKey.split(':');
			const left = transactions.find(({id}) => id === leftId) as BankTransactionInternalTransferCandidate;
			const right = transactions.find(({id}) => id === rightId) as BankTransactionInternalTransferCandidate;
			const debit = left.creditDebitIndicator?.trim().toUpperCase() === 'DBIT' ? left : right;
			const credit = debit.id === left.id ? right : left;

			return {
				transactionIds: [debit.id, credit.id] as [string, string],
				evidence,
			};
		})
		.sort((left, right) => left.transactionIds[0].localeCompare(right.transactionIds[0]));
}

function isEligible(transaction: BankTransactionInternalTransferCandidate): boolean {
	const indicator = transaction.creditDebitIndicator?.trim().toUpperCase();
	return (
		(transaction.financialEventType === null || transaction.financialEventType === INTERNAL_TRANSFER_TYPE) &&
		BOOKED_STATUSES.has(transaction.transactionStatus?.trim().toUpperCase() ?? '') &&
		(indicator === 'DBIT' || indicator === 'CRDT') &&
		parseAmount(transaction.amount) !== null &&
		parseDate(transaction.bookingDate) !== null
	);
}

function isCompatible(
	left: BankTransactionInternalTransferCandidate,
	right: BankTransactionInternalTransferCandidate,
): boolean {
	if (left.ownerId !== right.ownerId || left.bankAccountId === right.bankAccountId) return false;
	if (normalizeCurrency(left.currency) !== normalizeCurrency(right.currency)) return false;
	if (left.creditDebitIndicator?.trim().toUpperCase() === right.creditDebitIndicator?.trim().toUpperCase()) {
		return false;
	}

	const leftAmount = parseAmount(left.amount);
	const rightAmount = parseAmount(right.amount);
	const leftDate = parseDate(left.bookingDate);
	const rightDate = parseDate(right.bookingDate);
	if (leftAmount === null || rightAmount === null || leftDate === null || rightDate === null) return false;

	const minimumAmount = leftAmount < rightAmount ? leftAmount : rightAmount;
	const amountDifference = leftAmount > rightAmount ? leftAmount - rightAmount : rightAmount - leftAmount;
	if (minimumAmount === 0n || amountDifference * 200n > minimumAmount) {
		return false;
	}

	return Math.abs(leftDate - rightDate) <= 2;
}

function getEvidence(
	left: BankTransactionInternalTransferCandidate,
	right: BankTransactionInternalTransferCandidate,
): BankTransactionInternalTransferMatchEvidence | null {
	if (
		identifiersEqual(left.counterpartyAccountIdentifier, right.accountIdentifier) ||
		identifiersEqual(right.counterpartyAccountIdentifier, left.accountIdentifier)
	) {
		return BANK_TRANSACTION_INTERNAL_TRANSFER_MATCH_EVIDENCE.COUNTERPARTY_ACCOUNT;
	}

	if (
		left.bankConnectionId === right.bankConnectionId &&
		left.transactionType?.trim().toUpperCase() === TRANSFER_TYPE &&
		right.transactionType?.trim().toUpperCase() === TRANSFER_TYPE
	) {
		return BANK_TRANSACTION_INTERNAL_TRANSFER_MATCH_EVIDENCE.SAME_CONNECTION_TRANSFER;
	}

	if (hasOwnerIdentityProviderMarker(left, right)) {
		return BANK_TRANSACTION_INTERNAL_TRANSFER_MATCH_EVIDENCE.OWNER_IDENTITY_PROVIDER_MARKER;
	}

	return null;
}

function isTransferLike(transaction: BankTransactionInternalTransferCandidate): boolean {
	return (
		transaction.transactionType?.trim().toUpperCase() === TRANSFER_TYPE ||
		normalizeEvidenceText(transaction.bankTransactionDescription) ===
			normalizeEvidenceText(SCT_INCOMING_BANK_TRANSACTION_DESCRIPTION)
	);
}

function hasOwnerIdentityProviderMarker(
	left: BankTransactionInternalTransferCandidate,
	right: BankTransactionInternalTransferCandidate,
): boolean {
	if (left.bankConnectionId === right.bankConnectionId) return false;
	if (!isTransferLike(left) || !isTransferLike(right)) return false;

	const leftOwnerName = normalizeEvidenceText(left.ownerName);
	const rightOwnerName = normalizeEvidenceText(right.ownerName);
	if (!leftOwnerName || leftOwnerName !== rightOwnerName) return false;
	if (!containsEvidencePhrase(getEvidenceTexts(left), leftOwnerName)) return false;
	if (!containsEvidencePhrase(getEvidenceTexts(right), rightOwnerName)) return false;

	const leftAspspName = normalizeEvidenceText(left.aspspName);
	const rightAspspName = normalizeEvidenceText(right.aspspName);
	if (!leftAspspName || !rightAspspName) return false;

	return (
		containsEvidencePhrase(getEvidenceTexts(left), rightAspspName) ||
		containsEvidencePhrase(getEvidenceTexts(right), leftAspspName)
	);
}

function getEvidenceTexts(transaction: BankTransactionInternalTransferCandidate): readonly (string | null)[] {
	return [
		transaction.description,
		transaction.counterpartyName,
		transaction.remittanceInformation,
		transaction.bankTransactionDescription,
	];
}

function containsEvidencePhrase(values: readonly (string | null)[], phrase: string): boolean {
	return values.some((value) => {
		const normalizedValue = normalizeEvidenceText(value);
		return normalizedValue.length > 0 && ` ${normalizedValue} `.includes(` ${phrase} `);
	});
}

function normalizeEvidenceText(value: string | null | undefined): string {
	return (
		value
			?.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, ' ')
			.trim() ?? ''
	);
}

function identifiersEqual(left: BankAccountIdentifier | null, right: BankAccountIdentifier | null): boolean {
	return bankAccountIdentifiersEqual(left, right);
}

function addCandidate(candidateIds: Map<string, Set<string>>, id: string, candidateId: string): void {
	const candidates = candidateIds.get(id) ?? new Set<string>();
	candidates.add(candidateId);
	candidateIds.set(id, candidates);
}

function normalizeCurrency(value: string): string {
	return value.trim().toUpperCase();
}

function parseAmount(value: string): bigint | null {
	const match = /^\s*[+-]?(\d+)(?:\.(\d{1,8}))?\s*$/.exec(value);
	if (!match) return null;

	const fraction = (match[2] ?? '').padEnd(AMOUNT_SCALE, '0');
	return BigInt(match[1]) * AMOUNT_SCALE_FACTOR + BigInt(fraction);
}

function parseDate(value: string | null): number | null {
	if (!value) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const timestamp = Date.UTC(year, month - 1, day);
	const date = new Date(timestamp);
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
		return null;
	}

	return Math.trunc(timestamp / 86_400_000);
}
