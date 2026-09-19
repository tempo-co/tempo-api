import {
	MATCH_EVIDENCE_ANCHORS,
	type TransferMatcherTransactionInput,
	matchesTransferPairs,
} from './bank-transaction-transfer-matcher';

function tx(overrides: Partial<TransferMatcherTransactionInput> = {}): TransferMatcherTransactionInput {
	return {
		id: 'tx-1',
		bankAccountId: 'acc-1',
		accountProviderAccountId: 'prov-acc-1',
		connectionProviderAccountId: 'conn-1',
		amount: '100.00',
		currency: 'EUR',
		creditDebitIndicator: 'DBIT',
		bookingDate: '2026-09-10',
		transactionType: 'TRANSFER',
		counterpartyName: null,
		counterpartyAccount: null,
		...overrides,
	};
}

describe('bank-transaction-transfer-matcher', () => {
	it('links an intra-connection transfer when both legs are transfers on the same connection', () => {
		const matches = matchesTransferPairs([
			tx({id: 'tx-debit', amount: '-100.00', creditDebitIndicator: 'DBIT', bookingDate: '2026-09-10'}),
			tx({
				id: 'tx-credit',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'prov-acc-2',
				amount: '100.00',
				creditDebitIndicator: 'CRDT',
				bookingDate: '2026-09-11',
			}),
		]);
		expect(matches).toHaveLength(1);
		expect(matches[0].legATransactionId).toBe('tx-debit');
		expect(matches[0].legBTransactionId).toBe('tx-credit');
		expect(matches[0].evidence.matchedOn).toBe(MATCH_EVIDENCE_ANCHORS.INTRA_CONNECTION_ACCOUNT);
	});
	// further tests follow

	it('links a cross-connection transfer only when counterparty account evidence exists', () => {
		const matches = matchesTransferPairs([
			tx({
				id: 'tx-out',
				connectionProviderAccountId: 'conn-revolut',
				amount: '-50.00',
				creditDebitIndicator: 'DBIT',
				counterpartyAccount: 'NL91ABNA0417164300',
				bookingDate: '2026-09-10',
			}),
			tx({
				id: 'tx-in',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'NL91ABNA0417164300',
				connectionProviderAccountId: 'conn-abn',
				amount: '50.00',
				creditDebitIndicator: 'CRDT',
				bookingDate: '2026-09-10',
				transactionType: 'OTHER',
			}),
		]);
		expect(matches).toHaveLength(1);
		expect(matches[0].evidence.matchedOn).toBe(MATCH_EVIDENCE_ANCHORS.COUNTERPARTY_ACCOUNT);
	});

	it('does not link cross-connection legs without any evidence anchor', () => {
		const matches = matchesTransferPairs([
			tx({id: 'tx-a', connectionProviderAccountId: 'conn-a', amount: '-50.00', creditDebitIndicator: 'DBIT'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'prov-2',
				connectionProviderAccountId: 'conn-b',
				amount: '50.00',
				creditDebitIndicator: 'CRDT',
			}),
		]);
		expect(matches).toEqual([]);
	});

	it('ignores legs from multiple owners', () => {
		const crossOwner = [
			tx({
				id: 'tx-a',
				bankAccountId: 'acc-a',
				accountProviderAccountId: 'pa-1',
				connectionProviderAccountId: 'c1',
				amount: '-10.00',
			}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-b',
				accountProviderAccountId: 'pa-2',
				connectionProviderAccountId: 'pa-1-other-owner-conn',
				amount: '10.00',
				creditDebitIndicator: 'CRDT',
			}),
		];
		expect(matchesTransferPairs(crossOwner)).toEqual([]);
		expect(matchesTransferPairs(crossOwner)).toEqual([]);
	});

	it('does not link legs on the same bank account', () => {
		const matches = matchesTransferPairs([
			tx({id: 'tx-a', amount: '-10.00'}),
			tx({id: 'tx-b', amount: '10.00', creditDebitIndicator: 'CRDT', transactionType: 'TRANSFER'}),
		]);
		expect(matches).toEqual([]);
	});

	it('rejects cross-currency pairs in v1', () => {
		const matches = matchesTransferPairs([
			tx({id: 'tx-a', amount: '-100.00', currency: 'EUR', counterpartyAccount: 'REV-xs'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '100.00',
				currency: 'USD',
				creditDebitIndicator: 'CRDT',
			}),
		]);
		expect(matches).toEqual([]);
	});

	it('rejects same-direction legs', () => {
		const matches = matchesTransferPairs([
			tx({id: 'tx-a', amount: '-100.00', counterpartyAccount: 'X'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '-100.00',
				creditDebitIndicator: 'DBIT',
			}),
		]);
		expect(matches).toEqual([]);
	});

	it('rejects legs with missing or unknown indicators', () => {
		expect(
			matchesTransferPairs([
				tx({id: 'tx-a', amount: '-100.00', creditDebitIndicator: null, counterpartyAccount: 'X'}),
				tx({
					id: 'tx-b',
					bankAccountId: 'acc-2',
					accountProviderAccountId: 'pa-2',
					amount: '100.00',
					creditDebitIndicator: 'CRDT',
				}),
			]),
		).toEqual([]);
	});

	it('accepts equal amounts and small fee deltas within tolerance', () => {
		const within = matchesTransferPairs([
			tx({id: 'tx-a', amount: '-100.00'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '99.60',
				creditDebitIndicator: 'CRDT',
			}),
		]);
		expect(within).toHaveLength(1);
		expect(within[0].evidence.amountDelta).toBe('0.40');
	});

	it('rejects amount deltas beyond the 0.5% tolerance', () => {
		const beyond = matchesTransferPairs([
			tx({id: 'tx-a', amount: '-100.00', counterpartyAccount: 'X'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '99.20',
				creditDebitIndicator: 'CRDT',
			}),
		]);
		expect(beyond).toEqual([]);
	});

	it('accepts bookings exactly 2 days apart and rejects 3 days apart', () => {
		const two = matchesTransferPairs([
			tx({id: 'tx-a', bookingDate: '2026-09-10', amount: '-10.00'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '10.00',
				creditDebitIndicator: 'CRDT',
				bookingDate: '2026-09-12',
			}),
		]);
		expect(two).toHaveLength(1);

		const three = matchesTransferPairs([
			tx({id: 'tx-a', bookingDate: '2026-09-10', counterpartyAccount: 'X'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '10.00',
				creditDebitIndicator: 'CRDT',
				bookingDate: '2026-09-13',
			}),
		]);
		expect(three).toEqual([]);
	});

	it('rejects rows with a missing booking date', () => {
		const matches = matchesTransferPairs([
			tx({id: 'tx-a', bookingDate: null, counterpartyAccount: 'X'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '10.00',
				creditDebitIndicator: 'CRDT',
			}),
		]);
		expect(matches).toEqual([]);
	});

	it('links one debit to only one credit and leaves ambiguous duplicates unmatched', () => {
		const matches = matchesTransferPairs([
			tx({id: 'tx-out', amount: '-100.00'}),
			tx({
				id: 'tx-in-1',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '100.00',
				creditDebitIndicator: 'CRDT',
				bookingDate: '2026-09-10',
			}),
			tx({
				id: 'tx-in-2',
				bankAccountId: 'acc-3',
				accountProviderAccountId: 'pa-3',
				amount: '100.00',
				creditDebitIndicator: 'CRDT',
				bookingDate: '2026-09-10',
			}),
		]);
		expect(matches).toEqual([]);
	});

	it('is deterministic across reruns', () => {
		const input = [
			tx({id: 'tx-a', amount: '-100.00', bookingDate: '2026-09-10'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '99.90',
				creditDebitIndicator: 'CRDT',
				bookingDate: '2026-09-10',
			}),
		];
		const first = matchesTransferPairs(structuredClone(input));
		const second = matchesTransferPairs(structuredClone(input));
		expect(second).toEqual(first);
	});

	it('does not interfere with rows that carry other event classification upstream', () => {
		const matches = matchesTransferPairs([
			tx({id: 'tx-a', amount: '-100.00'}),
			tx({
				id: 'tx-b',
				bankAccountId: 'acc-2',
				accountProviderAccountId: 'pa-2',
				amount: '100.00',
				creditDebitIndicator: 'CRDT',
			}),
		]);
		// the matcher itself does not read the event fields; exclusion of
		// already-classified rows happens in the sync caller (tested at the sync level)
		expect(matches).toHaveLength(1);
	});
});
