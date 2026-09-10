import {INestApplicationContext} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';
import {BankAccountBalance} from '@modules/banking/bank-account-balance.entity';
import {BankAccount} from '@modules/banking/bank-account.entity';
import {BankConnection} from '@modules/banking/bank-connection.entity';
import {BankSyncRun} from '@modules/banking/bank-sync-run.entity';
import {getBankTransactionDisplayDescription} from '@modules/banking/bank-transaction-display';
import {BANK_TRANSACTION_TYPES} from '@modules/banking/bank-transaction-type';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';

import {VERIFIED_ACCOUNT_EMAIL} from './seed.constants';

const SEEDED_BANK_CONNECTION_ID = '00000000-0000-4000-8000-000000000001';
const SEEDED_BANK_ACCOUNT_ID = '00000000-0000-4000-8000-000000000002';
const SEEDED_SYNC_RUN_ID = '00000000-0000-4000-8000-000000000003';
const SEEDED_BALANCE_IDS = ['00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005'] as const;

export async function seedBankingData(app: INestApplicationContext) {
	const accountRepository = app.get<Repository<Account>>(getRepositoryToken(Account));
	const account = await accountRepository.findOneByOrFail({email: VERIFIED_ACCOUNT_EMAIL});
	const bankConnectionRepository = app.get<Repository<BankConnection>>(getRepositoryToken(BankConnection));
	const bankAccountRepository = app.get<Repository<BankAccount>>(getRepositoryToken(BankAccount));
	const bankSyncRunRepository = app.get<Repository<BankSyncRun>>(getRepositoryToken(BankSyncRun));
	const balanceRepository = app.get<Repository<BankAccountBalance>>(getRepositoryToken(BankAccountBalance));
	const transactionRepository = app.get<Repository<BankTransaction>>(getRepositoryToken(BankTransaction));

	const bankConnection = await bankConnectionRepository.save(
		bankConnectionRepository.create({
			id: SEEDED_BANK_CONNECTION_ID,
			account,
			provider: 'enable-banking',
			aspspName: 'ABN AMRO',
			aspspCountry: 'NL',
			aspspIdentifier: null,
			providerSessionId: 'seed-provider-session',
			authorizationStateHash: null,
			status: 'AUTHORIZED',
			consentValidUntil: new Date('2030-01-01T00:00:00.000Z'),
			lastSyncedAt: new Date('2026-08-26T12:00:00.000Z'),
			lastSyncError: null,
		}),
	);

	const bankAccount = await bankAccountRepository.save(
		bankAccountRepository.create({
			id: SEEDED_BANK_ACCOUNT_ID,
			bankConnection,
			providerAccountId: 'seed-provider-account',
			identificationHash: 'seed-identification-hash',
			name: 'Main account',
			details: null,
			alias: 'Daily spending',
			currency: 'EUR',
			cashAccountType: 'CACC',
			usage: 'PRIV',
			maskedIdentifier: null,
			currentBalanceAmount: '123.45000000',
			currentBalanceType: 'AVAILABLE',
			balanceUpdatedAt: new Date('2026-08-26T12:00:00.000Z'),
			isActive: true,
		}),
	);

	const bankSyncRun = await bankSyncRunRepository.save(
		bankSyncRunRepository.create({
			id: SEEDED_SYNC_RUN_ID,
			bankConnection,
			status: 'SUCCEEDED',
			startedAt: new Date('2026-08-26T12:00:00.000Z'),
			finishedAt: new Date('2026-08-26T12:00:02.000Z'),
			requestedFrom: null,
			requestedTo: '2026-08-26',
			accountsFetched: 1,
			balancesFetched: 2,
			transactionsFetched: 13,
			errorMessage: null,
		}),
	);

	await balanceRepository.save([
		balanceRepository.create({
			id: SEEDED_BALANCE_IDS[0],
			bankAccountId: bankAccount.id,
			bankAccount,
			bankSyncRunId: bankSyncRun.id,
			bankSyncRun,
			name: 'Available balance',
			balanceType: 'AVAILABLE',
			amount: '123.45000000',
			currency: 'EUR',
			lastChangeDateTime: new Date('2026-08-26T12:00:00.000Z'),
			referenceDate: '2026-08-26',
			lastCommittedTransaction: null,
			observedAt: new Date('2026-08-26T12:00:00.000Z'),
		}),
		balanceRepository.create({
			id: SEEDED_BALANCE_IDS[1],
			bankAccountId: bankAccount.id,
			bankAccount,
			bankSyncRunId: bankSyncRun.id,
			bankSyncRun,
			name: 'Booked balance',
			balanceType: 'BOOKED',
			amount: '120.00000000',
			currency: 'EUR',
			lastChangeDateTime: null,
			referenceDate: '2026-08-26',
			lastCommittedTransaction: null,
			observedAt: new Date('2026-08-26T12:00:00.000Z'),
		}),
	]);

	await transactionRepository.save(
		createSeedTransactions(bankAccount).map((transaction) => transactionRepository.create(transaction)),
	);
}

function createSeedTransactions(bankAccount: BankAccount) {
	const common = {
		bankAccountId: bankAccount.id,
		bankAccount,
		currency: 'EUR',
		transactionStatus: 'BOOK',
		bankTransactionCode: null,
		bankTransactionSubCode: null,
		merchantCategoryCode: null,
		remittanceInformation: null,
		balanceAfterAmount: null,
		balanceAfterCurrency: null,
		instructedAmount: null,
		instructedCurrency: null,
		exchangeRate: null,
		exchangeRateUnitCurrency: null,
		exchangeRateType: null,
		referenceNumber: null,
		referenceNumberScheme: null,
	};

	const transactions = [
		{
			id: '00000000-0000-4000-8000-000000000011',
			transactionDate: '2026-08-24',
			bookingDate: '2026-08-26',
			valueDate: '2026-08-25',
			description: 'Coffee shop',
			counterpartyName: 'Cafe',
			amount: '-4.50000000',
			creditDebitIndicator: 'DBIT',
			transactionType: BANK_TRANSACTION_TYPES.CARD_PAYMENT,
			bankTransactionDescription: 'Card payment',
			merchantCategoryCode: '5814',
			remittanceInformation: 'Morning coffee',
			balanceAfterAmount: '100.50000000',
			balanceAfterCurrency: 'EUR',
			instructedAmount: '4.50000000',
			instructedCurrency: 'USD',
			exchangeRate: '0.923400000000000000',
			exchangeRateUnitCurrency: 'USD',
			exchangeRateType: 'SPOT',
			referenceNumber: 'reference-coffee',
			referenceNumberScheme: 'RF',
		},
		{
			id: '00000000-0000-4000-8000-000000000012',
			transactionDate: '2026-08-19',
			bookingDate: '2026-08-20',
			valueDate: '2026-08-20',
			description: 'Salary',
			counterpartyName: 'Employer',
			amount: '100.00000000',
			creditDebitIndicator: 'CRDT',
			transactionType: BANK_TRANSACTION_TYPES.SALARY,
			bankTransactionDescription: 'Salary payment',
		},
		{
			id: '00000000-0000-4000-8000-000000000013',
			transactionDate: '2026-08-18',
			bookingDate: '2026-08-19',
			valueDate: '2026-08-19',
			description:
				'Online card payment at a particularly long merchant description that resembles the detail returned by the bank provider',
			counterpartyName: 'Long Merchant Name',
			amount: '-42.00000000',
			creditDebitIndicator: 'DBIT',
			transactionType: BANK_TRANSACTION_TYPES.CARD_PAYMENT,
			bankTransactionDescription: 'Card payment',
			merchantCategoryCode: '5999',
			remittanceInformation: 'Long transaction description',
		},
		{
			id: '00000000-0000-4000-8000-000000000014',
			transactionDate: '2026-08-17',
			bookingDate: '2026-08-18',
			valueDate: '2026-08-18',
			description: 'Provider purchase',
			counterpartyName: 'Shop',
			amount: '-12.50000000',
			creditDebitIndicator: 'DBIT',
			transactionType: BANK_TRANSACTION_TYPES.CARD_PAYMENT,
			bankTransactionDescription: 'Card payment',
			merchantCategoryCode: '5411',
			remittanceInformation: 'Groceries',
		},
		...Array.from({length: 9}, (_, index) => {
			const day = String(17 - index).padStart(2, '0');
			return {
				id: `00000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`,
				transactionDate: `2026-08-${day}`,
				bookingDate: `2026-08-${day}`,
				valueDate: `2026-08-${day}`,
				description: `Extra transaction ${index + 1}`,
				counterpartyName: 'Provider',
				amount: '-1.00000000',
				creditDebitIndicator: 'DBIT',
				transactionType: BANK_TRANSACTION_TYPES.OTHER,
				bankTransactionDescription: null,
			};
		}),
	];

	return transactions.map((transaction) => ({
		...common,
		dedupeKey: `seed-${transaction.id}`,
		providerTransactionId: transaction.id,
		entryReference: transaction.id,
		...transaction,
		displayDescription: getBankTransactionDisplayDescription({
			description: transaction.description,
			counterpartyName: transaction.counterpartyName,
		}),
	}));
}
