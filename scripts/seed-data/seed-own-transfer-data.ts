import {INestApplicationContext} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import {DeepPartial, Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';
import {BANK_TRANSACTION_TYPES} from '@modules/banking/bank-transaction-type';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';
import {OwnTransferService} from '@modules/banking/services/own-transfer.service';

import {BankingFixtures} from './banking-fixtures';
import {OWN_TRANSFER_ACCOUNT_EMAIL} from './seed.constants';

/** Synthetic account holder and IBAN (published example). */
const SEEDED_HOLDER_NAME = 'Jane Example';
const SEEDED_REVOLUT_IBAN = 'GB82WEST12345698765432';

export const SEEDED_OWN_TRANSFER_IDS = {
	ibanPairOutgoing: '00000000-0000-4000-8000-000000000101',
	ibanPairIncoming: '00000000-0000-4000-8000-000000000102',
	namePairOutgoing: '00000000-0000-4000-8000-000000000103',
	namePairIncoming: '00000000-0000-4000-8000-000000000104',
	oneSided: '00000000-0000-4000-8000-000000000105',
	coincidenceOutgoing: '00000000-0000-4000-8000-000000000106',
	coincidenceIncoming: '00000000-0000-4000-8000-000000000107',
	cardTopUp: '00000000-0000-4000-8000-000000000108',
} as const;

/**
 * Seeds an owner with two connected banks and synthetic own-transfer cases: an IBAN pair, a name pair,
 * a one-sided transfer, a same-amount coincidence that must stay unlabelled, and a card top-up.
 */
export async function seedOwnTransferData(
	app: INestApplicationContext,
	{accountEmail = OWN_TRANSFER_ACCOUNT_EMAIL}: {accountEmail?: string} = {},
) {
	const account = await app
		.get<Repository<Account>>(getRepositoryToken(Account))
		.findOneByOrFail({email: accountEmail});
	const fixtures = new BankingFixtures(app);

	const abnConnection = await fixtures.createConnection(account, {
		id: '00000000-0000-4000-8000-000000000091',
		providerSessionId: 'seed-own-transfer-abn-session',
		lastSyncedAt: new Date('2026-08-26T12:00:00.000Z'),
	});
	const abnAccount = await fixtures.createBankAccount(abnConnection, {
		id: '00000000-0000-4000-8000-000000000092',
		providerAccountId: 'seed-own-transfer-abn-account',
		identificationHash: 'seed-own-transfer-abn-hash',
		name: SEEDED_HOLDER_NAME,
		alias: 'Main',
	});
	const revolutConnection = await fixtures.createConnection(account, {
		id: '00000000-0000-4000-8000-000000000093',
		aspspName: 'Revolut',
		aspspCountry: 'LT',
		providerSessionId: 'seed-own-transfer-revolut-session',
		lastSyncedAt: new Date('2026-08-26T12:00:00.000Z'),
	});
	const revolutAccount = await fixtures.createBankAccount(revolutConnection, {
		id: '00000000-0000-4000-8000-000000000094',
		providerAccountId: 'seed-own-transfer-revolut-account',
		identificationHash: 'seed-own-transfer-revolut-hash',
		name: SEEDED_HOLDER_NAME,
		alias: 'Travel',
		iban: SEEDED_REVOLUT_IBAN,
	});

	const ids = SEEDED_OWN_TRANSFER_IDS;
	await fixtures.createTransactions(
		abnAccount,
		seedTransactions([
			{
				id: ids.ibanPairOutgoing,
				bookingDate: '2026-08-24',
				amount: '-200.00000000',
				description: 'Online banking transfer to Travel',
				counterpartyIban: SEEDED_REVOLUT_IBAN,
			},
			{
				id: ids.namePairIncoming,
				bookingDate: '2026-08-21',
				amount: '50.00000000',
				description: `SEPA Overboeking Naam: ${SEEDED_HOLDER_NAME} Omschrijving: back from Travel`,
				counterpartyName: SEEDED_HOLDER_NAME,
			},
			{
				id: ids.coincidenceOutgoing,
				bookingDate: '2026-08-18',
				amount: '-25.00000000',
				description: 'SEPA Overboeking Naam: Sam Friend Omschrijving: Birthday gift',
				counterpartyName: 'Sam Friend',
			},
		]),
	);
	await fixtures.createTransactions(
		revolutAccount,
		seedTransactions([
			{
				id: ids.ibanPairIncoming,
				bookingDate: '2026-08-25',
				amount: '200.00000000',
				description: `Payment from ${SEEDED_HOLDER_NAME}`,
			},
			{
				id: ids.namePairOutgoing,
				bookingDate: '2026-08-21',
				amount: '-50.00000000',
				description: `To ${SEEDED_HOLDER_NAME}`,
			},
			{
				id: ids.oneSided,
				bookingDate: '2026-08-19',
				amount: '300.00000000',
				description: `Payment from ${SEEDED_HOLDER_NAME}`,
			},
			{
				id: ids.coincidenceIncoming,
				bookingDate: '2026-08-18',
				amount: '25.00000000',
				description: 'Payment from Sam Friend',
			},
			{
				id: ids.cardTopUp,
				bookingDate: '2026-08-17',
				amount: '40.00000000',
				description: 'Top-up by *0000',
				transactionType: BANK_TRANSACTION_TYPES.OTHER,
			},
		]),
	);

	await app.get(OwnTransferService).recomputeForOwner(account.id);
	return {abnConnection, abnAccount, revolutConnection, revolutAccount};
}

function seedTransactions(transactions: (DeepPartial<BankTransaction> & {id: string; amount: string})[]) {
	return transactions.map((transaction) => ({
		valueDate: transaction.bookingDate,
		transactionDate: transaction.bookingDate,
		amountInBaseCurrency: transaction.amount,
		creditDebitIndicator: transaction.amount.startsWith('-') ? 'DBIT' : 'CRDT',
		transactionType: BANK_TRANSACTION_TYPES.TRANSFER,
		...transaction,
		dedupeKey: `seed-${transaction.id}`,
		providerTransactionId: transaction.id,
		entryReference: transaction.id,
	}));
}
