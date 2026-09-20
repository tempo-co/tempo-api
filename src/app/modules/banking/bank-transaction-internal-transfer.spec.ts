import {matchBankTransactionInternalTransfers} from './bank-transaction-internal-transfer';

const ownAccount = (value: string) => ({scheme: 'IBAN' as const, value});

type Candidate = Parameters<typeof matchBankTransactionInternalTransfers>[0][number];
type TransactionOverrides = Partial<Candidate> & {ownerIdentityToken?: string | null};

function transaction(overrides: TransactionOverrides = {}): Candidate {
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
		ownerName: null,
		ownerIdentityToken: null,
		aspspName: null,
		description: null,
		counterpartyName: null,
		remittanceInformation: null,
		bankTransactionDescription: null,
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

	it('matches an owner-identity pair with a cross-provider marker', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			accountIdentifier: null,
			counterpartyAccountIdentifier: null,
			ownerName: 'Synthetic Owner',
			aspspName: 'Synthetic Bank',
			description: 'To Synthetic Owner',
			amount: '-50.00000000',
			creditDebitIndicator: 'DBIT',
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-b',
			bankAccountId: 'account-b',
			accountIdentifier: null,
			counterpartyAccountIdentifier: null,
			ownerName: 'Synthetic Owner',
			aspspName: 'Other Bank',
			description: 'Received from Synthetic Bank for Synthetic Owner',
			bankTransactionDescription: 'SCT INCOMING',
			transactionType: 'OTHER',
			amount: '50.00000000',
			creditDebitIndicator: 'CRDT',
		});

		expect(matchBankTransactionInternalTransfers([debit, credit])).toEqual([
			{
				transactionIds: ['debit', 'credit'],
				evidence: 'OWNER_IDENTITY_PROVIDER_MARKER',
			},
		]);
	});

	it('matches two provider descriptions with a configured owner identity token', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			ownerIdentityToken: 'synthetic-surname',
			description: 'Transfer for Synthetic Surname',
			transactionType: 'OTHER',
			amount: '-50.00000000',
			creditDebitIndicator: 'DBIT',
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-b',
			bankAccountId: 'account-b',
			ownerIdentityToken: 'synthetic-surname',
			description: 'Synthetic Surname received',
			transactionType: 'OTHER',
			amount: '50.00000000',
			creditDebitIndicator: 'CRDT',
		});

		expect(matchBankTransactionInternalTransfers([debit, credit])).toEqual([
			{
				transactionIds: ['debit', 'credit'],
				evidence: 'OWNER_IDENTITY_TOKEN',
			},
		]);
	});

	it('does not match an owner identity token embedded in a longer word', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			ownerIdentityToken: 'synthetic-surname',
			description: 'synthetic-surnamex sent',
			transactionType: 'OTHER',
			amount: '-50.00000000',
			creditDebitIndicator: 'DBIT',
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-b',
			bankAccountId: 'account-b',
			ownerIdentityToken: 'synthetic-surname',
			description: 'synthetic-surnamex received',
			transactionType: 'OTHER',
			amount: '50.00000000',
			creditDebitIndicator: 'CRDT',
		});

		expect(matchBankTransactionInternalTransfers([debit, credit])).toEqual([]);
	});
	it('does not use an owner identity token for card payments', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			ownerIdentityToken: 'synthetic-surname',
			description: 'Synthetic Surname card payment',
			transactionType: 'CARD_PAYMENT',
			amount: '-50.00000000',
			creditDebitIndicator: 'DBIT',
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-b',
			bankAccountId: 'account-b',
			ownerIdentityToken: 'synthetic-surname',
			description: 'Synthetic Surname card payment',
			transactionType: 'CARD_PAYMENT',
			amount: '50.00000000',
			creditDebitIndicator: 'CRDT',
		});

		expect(matchBankTransactionInternalTransfers([debit, credit])).toEqual([]);
	});

	it('does not use owner identity without a cross-provider marker', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			ownerName: 'Synthetic Owner',
			aspspName: 'Synthetic Bank',
			description: 'To Synthetic Owner',
			amount: '-50.00000000',
			creditDebitIndicator: 'DBIT',
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-b',
			bankAccountId: 'account-b',
			ownerName: 'Synthetic Owner',
			aspspName: 'Other Bank',
			description: 'Received from another bank for Synthetic Owner',
			amount: '50.00000000',
			creditDebitIndicator: 'CRDT',
		});

		expect(matchBankTransactionInternalTransfers([debit, credit])).toEqual([]);
	});

	it('does not match a card payment with transfer-like identity text', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			ownerName: 'Synthetic Owner',
			aspspName: 'Synthetic Bank',
			description: 'To Synthetic Owner',
			amount: '-50.00000000',
			creditDebitIndicator: 'DBIT',
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-b',
			bankAccountId: 'account-b',
			ownerName: 'Synthetic Owner',
			aspspName: 'Other Bank',
			description: 'Received from Synthetic Bank for Synthetic Owner',
			transactionType: 'CARD_PAYMENT',
			bankTransactionDescription: 'Card purchase',
			amount: '50.00000000',
			creditDebitIndicator: 'CRDT',
		});

		expect(matchBankTransactionInternalTransfers([debit, credit])).toEqual([]);
	});

	it('matches two booked transfer rows on the same connection without account identifiers', () => {
		const debit = transaction({
			id: 'debit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-a',
			amount: '-50.00000000',
			creditDebitIndicator: 'DBIT',
			transactionStatus: 'COMPLETED',
			accountIdentifier: null,
			counterpartyAccountIdentifier: null,
		});
		const credit = transaction({
			id: 'credit',
			bankConnectionId: 'connection-a',
			bankAccountId: 'account-b',
			amount: '50.00000000',
			creditDebitIndicator: 'CRDT',
			transactionStatus: 'COMPLETED',
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
