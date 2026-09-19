import {matchBankTransactionInternalTransfers} from './bank-transaction-internal-transfer';

const ownAccount = (value: string) => ({scheme: 'IBAN' as const, value});

function transaction(
	overrides: Partial<Parameters<typeof matchBankTransactionInternalTransfers>[0][number]> = {},
): Parameters<typeof matchBankTransactionInternalTransfers>[0][number] {
	return {
		id: 'transaction-id',
		ownerId: 'owner-id',
		bankConnectionId: 'connection-id',
		bankAccountId: 'account-id',
		accountIdentifier: null,
		counterpartyAccountIdentifier: null,
		amount: '100.00000000',
		currency: 'EUR',
		creditDebitIndicator: 'CRDT',
		transactionStatus: 'BOOK',
		transactionType: 'TRANSFER',
		bookingDate: '2026-09-10',
		financialEventType: null,
		...overrides,
	};
}

describe('bank transaction internal transfer matching', () => {
	it('matches an evidenced same-owner pair within the amount and date tolerances', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			accountIdentifier: ownAccount('NL91ABNA0417164300'),
			counterpartyAccountIdentifier: ownAccount('NL20RABO0123456789'),
			amount: '-100.00000000',
			creditDebitIndicator: 'DBIT',
			bookingDate: '2026-09-10',
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-b',
			bankAccountId: 'account-b',
			accountIdentifier: ownAccount('NL20RABO0123456789'),
			counterpartyAccountIdentifier: ownAccount('NL91ABNA0417164300'),
			amount: '100.40000000',
			creditDebitIndicator: 'CRDT',
			bookingDate: '2026-09-12',
		});

		expect(matchBankTransactionInternalTransfers([debit, credit])).toEqual([
			{
				transactionIds: ['debit', 'credit'],
				evidence: 'COUNTERPARTY_ACCOUNT',
			},
		]);
	});

	it.each([
		[
			'a third-party transfer without matching account evidence',
			{
				accountIdentifier: ownAccount('NL30OTHER0000000000'),
				counterpartyAccountIdentifier: ownAccount('NL30OTHER0000000000'),
			},
		],
		['a pending transaction', {transactionStatus: 'PDNG'}],
		['a cross-currency candidate', {currency: 'USD'}],
		['a candidate outside the date window', {bookingDate: '2026-09-13'}],
		['an invalid calendar date', {bookingDate: '2026-02-30'}],
		['a candidate outside the amount tolerance', {amount: '100.50000001'}],
		['a candidate owned by another account', {ownerId: 'another-owner-id'}],
	] as const)('does not match %s', (_name, creditOverrides) => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			accountIdentifier: ownAccount('NL91ABNA0417164300'),
			counterpartyAccountIdentifier: ownAccount('NL20RABO0123456789'),
			amount: '-100.00000000',
			currency: 'EUR',
			creditDebitIndicator: 'DBIT',
			bookingDate: '2026-09-10',
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-b',
			bankAccountId: 'account-b',
			accountIdentifier: ownAccount('NL20RABO0123456789'),
			counterpartyAccountIdentifier: ownAccount('NL91ABNA0417164300'),
			amount: '100.00000000',
			creditDebitIndicator: 'CRDT',
			bookingDate: '2026-09-10',
			...creditOverrides,
		});

		expect(matchBankTransactionInternalTransfers([debit, credit])).toEqual([]);
	});

	it('leaves an ambiguous candidate unmatched', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			accountIdentifier: ownAccount('NL91ABNA0417164300'),
			counterpartyAccountIdentifier: ownAccount('NL20RABO0123456789'),
			amount: '-100.00000000',
			creditDebitIndicator: 'DBIT',
		});
		const creditOne = transaction({
			id: 'credit-one',
			bankConnectionId: 'connection-b',
			bankAccountId: 'account-b',
			accountIdentifier: ownAccount('NL20RABO0123456789'),
			amount: '100.00000000',
			creditDebitIndicator: 'CRDT',
		});
		const creditTwo = {...creditOne, id: 'credit-two', bankAccountId: 'account-c'};

		expect(matchBankTransactionInternalTransfers([debit, creditOne, creditTwo])).toEqual([]);
	});

	it('matches two booked transfer rows on the same connection without account identifiers', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			amount: '-50.00000000',
			creditDebitIndicator: 'DBIT',
			accountIdentifier: null,
			counterpartyAccountIdentifier: null,
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-b',
			amount: '50.00000000',
			creditDebitIndicator: 'CRDT',
			accountIdentifier: null,
			counterpartyAccountIdentifier: null,
		});

		expect(matchBankTransactionInternalTransfers([debit, credit])).toEqual([
			{
				transactionIds: ['debit', 'credit'],
				evidence: 'SAME_CONNECTION_TRANSFER',
			},
		]);
	});
});
