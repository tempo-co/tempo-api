import {EntityManager} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {
	BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES,
	BANK_TRANSACTION_FINANCIAL_EVENT_TYPES,
	BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
} from './bank-transaction-financial-event';
import {
	type BankTransactionInternalTransferCandidate,
	matchBankTransactionInternalTransfers,
} from './bank-transaction-internal-transfer';
import {BankTransaction} from './bank-transaction.entity';
import {createBankTransactionCategorizationInputHash} from './categorization/bank-transaction-categorization-input';
import {BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES} from './categorization/bank-transaction-categorization.constants';

export async function reconcileBankTransactionInternalTransfers(
	manager: EntityManager,
	ownerId: string,
	ownerIdentityToken: string | null = null,
): Promise<string[]> {
	const owner = await manager.getRepository(Account).findOne({
		select: {name: true},
		where: {id: ownerId},
	});
	const ownerName = owner?.name ?? null;
	const repository = manager.getRepository(BankTransaction);
	const transactions = await repository
		.createQueryBuilder('transaction')
		.innerJoinAndSelect('transaction.bankAccount', 'bankAccount')
		.innerJoinAndSelect('bankAccount.bankConnection', 'connection')
		.innerJoin('connection.account', 'account')
		.where('account.id = :ownerId', {ownerId})
		.andWhere('(transaction.financialEventType IS NULL OR transaction.financialEventType = :internalTransfer)', {
			internalTransfer: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER,
		})
		.setLock('pessimistic_write')
		.getMany();

	const matches = matchBankTransactionInternalTransfers(
		transactions.map((transaction): BankTransactionInternalTransferCandidate => ({
			id: transaction.id,
			ownerId,
			ownerName,
			ownerIdentityToken,
			bankConnectionId: transaction.bankAccount.bankConnection.id,
			bankAccountId: transaction.bankAccount.id,
			accountIdentifier: transaction.bankAccount.accountIdentifier ?? null,
			counterpartyAccountIdentifier: transaction.counterpartyAccountIdentifier ?? null,
			aspspName: transaction.bankAccount.bankConnection.aspspName,
			description: transaction.description,
			counterpartyName: transaction.counterpartyName,
			remittanceInformation: transaction.remittanceInformation,
			bankTransactionDescription: transaction.bankTransactionDescription,
			amount: transaction.amount,
			currency: transaction.currency,
			creditDebitIndicator: transaction.creditDebitIndicator,
			transactionStatus: transaction.transactionStatus,
			transactionType: transaction.transactionType,
			bookingDate: transaction.bookingDate,
			financialEventType: transaction.financialEventType,
		})),
	);
	const matchedTransactionIds = new Set(matches.flatMap(({transactionIds}) => transactionIds));
	const changedTransactions: BankTransaction[] = [];
	const categorizationTransactionIds: string[] = [];

	for (const transaction of transactions) {
		const shouldBeInternal = matchedTransactionIds.has(transaction.id);
		const hasExpectedInternalEvent =
			transaction.financialEventType === BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER &&
			transaction.financialEventSource === BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER &&
			transaction.financialEventRuleVersion === BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION;

		if (shouldBeInternal && hasExpectedInternalEvent) continue;
		if (!shouldBeInternal && transaction.financialEventType === null) continue;

		if (shouldBeInternal) {
			transaction.financialEventType = BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER;
			transaction.financialEventSource = BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER;
			transaction.financialEventRuleVersion = BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION;
			if (transaction.categorySource !== 'MANUAL') {
				Object.assign(transaction, BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES, {
					categoryInputHash: null,
					categoryStatus: 'NOT_APPLICABLE',
					categoryUpdatedAt: null,
				});
				categorizationTransactionIds.push(transaction.id);
			}
		} else {
			transaction.financialEventType = null;
			transaction.financialEventSource = null;
			transaction.financialEventRuleVersion = null;
			if (transaction.categorySource !== 'MANUAL') {
				Object.assign(transaction, BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES, {
					categoryInputHash: createBankTransactionCategorizationInputHash(transaction),
					categoryStatus: 'PENDING',
					categoryUpdatedAt: null,
				});
				categorizationTransactionIds.push(transaction.id);
			}
		}

		changedTransactions.push(transaction);
	}

	if (changedTransactions.length > 0) await repository.save(changedTransactions);
	return categorizationTransactionIds;
}
