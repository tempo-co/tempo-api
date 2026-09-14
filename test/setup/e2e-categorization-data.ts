import {INestApplicationContext} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import {In, Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';
import {BankAccount} from '@modules/banking/bank-account.entity';
import {BankConnection} from '@modules/banking/bank-connection.entity';
import {BANK_TRANSACTION_TYPES} from '@modules/banking/bank-transaction-type';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';

import {VERIFIED_ACCOUNT_EMAIL} from '../../scripts/seed-data/seed.constants';

export const CATEGORIZATION_E2E_CONNECTION_ID = '00000000-0000-4000-8000-000000000101';
export const CATEGORIZATION_E2E_ACCOUNT_ID = '00000000-0000-4000-8000-000000000102';
export const CATEGORIZATION_E2E_AI_TRANSACTION_ID = '00000000-0000-4000-8000-000000000103';
export const CATEGORIZATION_E2E_FAILURE_TRANSACTION_ID = '00000000-0000-4000-8000-000000000104';

const CATEGORIZATION_E2E_TRANSACTION_IDS = [
	CATEGORIZATION_E2E_AI_TRANSACTION_ID,
	CATEGORIZATION_E2E_FAILURE_TRANSACTION_ID,
] as const;

export async function seedBankTransactionCategorizationData(app: INestApplicationContext): Promise<void> {
	const accountRepository = app.get<Repository<Account>>(getRepositoryToken(Account));
	const bankConnectionRepository = app.get<Repository<BankConnection>>(getRepositoryToken(BankConnection));
	const bankAccountRepository = app.get<Repository<BankAccount>>(getRepositoryToken(BankAccount));
	const bankTransactionRepository = app.get<Repository<BankTransaction>>(getRepositoryToken(BankTransaction));
	const account = await accountRepository.findOneByOrFail({email: VERIFIED_ACCOUNT_EMAIL});

	await bankTransactionRepository.delete({id: In(CATEGORIZATION_E2E_TRANSACTION_IDS)});
	await bankAccountRepository.delete({id: CATEGORIZATION_E2E_ACCOUNT_ID});
	await bankConnectionRepository.delete({id: CATEGORIZATION_E2E_CONNECTION_ID});

	const connection = await bankConnectionRepository.save(
		bankConnectionRepository.create({
			id: CATEGORIZATION_E2E_CONNECTION_ID,
			account,
			provider: 'enable-banking',
			aspspName: 'ABN AMRO',
			aspspCountry: 'NL',
			aspspIdentifier: null,
			providerSessionId: 'categorization-e2e-session',
			authorizationStateHash: null,
			status: 'AUTHORIZED',
			consentValidUntil: new Date('2030-01-01T00:00:00.000Z'),
			lastSyncedAt: null,
			lastSyncError: null,
		}),
	);
	const bankAccount = await bankAccountRepository.save(
		bankAccountRepository.create({
			id: CATEGORIZATION_E2E_ACCOUNT_ID,
			bankConnection: connection,
			providerAccountId: 'categorization-e2e-account',
			identificationHash: 'categorization-e2e-identification',
			name: 'Categorization test account',
			details: null,
			alias: null,
			currency: 'EUR',
			cashAccountType: null,
			usage: null,
			maskedIdentifier: null,
			currentBalanceAmount: null,
			currentBalanceType: null,
			balanceUpdatedAt: null,
			isActive: true,
		}),
	);

	await bankTransactionRepository.save(
		[
			createCategorizationTransaction(bankAccount.id, {
				id: CATEGORIZATION_E2E_AI_TRANSACTION_ID,
				providerTransactionId: 'categorization-e2e-success',
				entryReference: 'categorization-e2e-success-entry',
				transactionDate: '2026-08-31',
				bookingDate: '2026-09-01',
				valueDate: '2026-09-01',
				amount: '-47.25',
				description: 'Lantern Books',
				displayDescription: 'Lantern Books',
				counterpartyName: 'Lantern Books',
				merchantCategoryCode: '5814',
				bankTransactionCode: 'PMNT',
				bankTransactionSubCode: 'CARD',
				remittanceInformation: 'Fiction and non-fiction',
			}),
			createCategorizationTransaction(bankAccount.id, {
				id: CATEGORIZATION_E2E_FAILURE_TRANSACTION_ID,
				providerTransactionId: 'categorization-e2e-failure',
				entryReference: 'categorization-e2e-failure-entry',
				transactionDate: '2026-09-02',
				bookingDate: '2026-09-02',
				valueDate: '2026-09-02',
				amount: '-12.00',
				description: 'Synthetic provider failure',
				displayDescription: 'Synthetic provider failure',
				counterpartyName: 'Synthetic provider failure',
			}),
		].map((transaction) => bankTransactionRepository.create(transaction)),
	);
}

type CategorizationTransactionOverrides = Partial<BankTransaction> &
	Pick<
		BankTransaction,
		| 'id'
		| 'providerTransactionId'
		| 'entryReference'
		| 'transactionDate'
		| 'bookingDate'
		| 'valueDate'
		| 'amount'
		| 'description'
		| 'displayDescription'
		| 'counterpartyName'
	>;

function createCategorizationTransaction(bankAccountId: string, overrides: CategorizationTransactionOverrides) {
	return {
		bankAccountId,
		dedupeKey: `categorization-e2e-${overrides.id}`,
		currency: 'EUR',
		creditDebitIndicator: 'DBIT',
		transactionType: BANK_TRANSACTION_TYPES.CARD_PAYMENT,
		transactionStatus: 'BOOK',
		bankTransactionCode: null,
		bankTransactionSubCode: null,
		bankTransactionDescription: 'Card purchase',
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
		category: null,
		categoryStatus: 'PENDING',
		categorySource: null,
		categoryConfidence: null,
		categoryInputHash: null,
		categoryAppliedInputHash: null,
		categoryProvider: null,
		categoryModel: null,
		categoryPromptVersion: null,
		categoryUpdatedAt: null,
		categoryLastError: null,
		...overrides,
	};
}
