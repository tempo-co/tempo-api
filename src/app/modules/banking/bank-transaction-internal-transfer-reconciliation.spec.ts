import type {EntityManager, Repository} from 'typeorm';

import {
	BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES,
	BANK_TRANSACTION_FINANCIAL_EVENT_TYPES,
	BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
} from './bank-transaction-financial-event';
import {reconcileBankTransactionInternalTransfers} from './bank-transaction-internal-transfer-reconciliation';
import {BankTransaction} from './bank-transaction.entity';

type TransactionOverrides = Omit<Partial<BankTransaction>, 'bankAccount'> & {
	bankAccount?: Record<string, unknown>;
};

function transaction(overrides: TransactionOverrides = {}): BankTransaction {
	const bankAccount = {
		id: 'bank-account-id',
		accountIdentifier: null,
		bankConnection: {id: 'connection-id', aspspName: 'Synthetic Bank'},
		...overrides.bankAccount,
	};

	return {
		id: 'transaction-id',
		amount: '100.00000000',
		currency: 'EUR',
		creditDebitIndicator: 'CRDT',
		transactionStatus: 'BOOK',
		transactionType: 'TRANSFER',
		bookingDate: '2026-09-10',
		financialEventType: null,
		financialEventSource: null,
		financialEventRuleVersion: null,
		category: null,
		categorySource: null,
		categoryStatus: 'PENDING',
		categoryInputHash: 'old-input-hash',
		categoryUpdatedAt: null,
		description: 'Synthetic transfer',
		displayDescription: 'Synthetic transfer',
		counterpartyName: null,
		bankAccount,
		...overrides,
	} as unknown as BankTransaction;
}

function createManager(rows: BankTransaction[]) {
	const queryBuilder = {
		innerJoinAndSelect: jest.fn().mockReturnThis(),
		innerJoin: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		setLock: jest.fn().mockReturnThis(),
		getMany: jest.fn().mockResolvedValue(rows),
	};
	const repository = {
		createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
		findOne: jest.fn().mockResolvedValue({name: 'Synthetic Owner'}),
		save: jest.fn().mockResolvedValue(rows),
	} as unknown as Repository<BankTransaction>;
	const manager = {
		getRepository: jest.fn().mockReturnValue(repository),
	} as unknown as EntityManager;

	return {manager, queryBuilder, repository};
}

describe('reconcileBankTransactionInternalTransfers', () => {
	it('marks a verified pair internal and preserves a manual category', async () => {
		const debit = transaction({
			id: 'debit',
			amount: '-100.00000000',
			creditDebitIndicator: 'DBIT',
			category: 'SHOPPING',
			categorySource: 'MANUAL',
			categoryStatus: 'COMPLETED',
			bankAccount: {
				id: 'account-a',
				accountIdentifier: {scheme: 'IBAN', value: 'NL91ABNA0417164300'},
				bankConnection: {id: 'connection-a', aspspName: 'Synthetic Bank'},
			},
			counterpartyAccountIdentifier: {scheme: 'IBAN', value: 'NL20RABO0123456789'},
		});
		const credit = transaction({
			id: 'credit',
			bankAccount: {
				id: 'account-b',
				accountIdentifier: {scheme: 'IBAN', value: 'NL20RABO0123456789'},
				bankConnection: {id: 'connection-b', aspspName: 'Synthetic Bank'},
			},
			counterpartyAccountIdentifier: {scheme: 'IBAN', value: 'NL91ABNA0417164300'},
		});
		const {manager, queryBuilder, repository} = createManager([debit, credit]);

		await expect(reconcileBankTransactionInternalTransfers(manager, 'owner-id')).resolves.toEqual(['credit']);

		expect(queryBuilder.where).toHaveBeenCalledWith('account.id = :ownerId', {ownerId: 'owner-id'});
		expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
		expect(repository.findOne).toHaveBeenCalledWith({select: {name: true}, where: {id: 'owner-id'}});
		expect(debit).toMatchObject({
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER,
			financialEventRuleVersion: BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
			category: 'SHOPPING',
			categorySource: 'MANUAL',
		});
		expect(credit).toMatchObject({
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER,
			financialEventRuleVersion: BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
			categoryStatus: 'NOT_APPLICABLE',
			categoryInputHash: null,
		});
		expect(repository.save).toHaveBeenCalledWith([debit, credit]);
	});

	it('uses the server-side owner identity token for provider descriptions', async () => {
		const debit = transaction({
			id: 'debit',
			amount: '-50.00000000',
			creditDebitIndicator: 'DBIT',
			transactionType: 'OTHER',
			description: 'synthetic-surname sent',
			bankAccount: {
				id: 'account-a',
				bankConnection: {id: 'connection-a', aspspName: 'Synthetic Bank'},
			},
		});
		const credit = transaction({
			id: 'credit',
			amount: '50.00000000',
			transactionType: 'OTHER',
			description: 'synthetic-surname received',
			bankAccount: {
				id: 'account-b',
				bankConnection: {id: 'connection-b', aspspName: 'Other Bank'},
			},
		});
		const {manager, repository} = createManager([debit, credit]);

		await expect(
			reconcileBankTransactionInternalTransfers(manager, 'owner-id', 'synthetic-surname'),
		).resolves.toEqual(['debit', 'credit']);
		expect(debit).toMatchObject({
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER,
			financialEventRuleVersion: BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
		});
		expect(credit).toMatchObject({
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER,
			financialEventRuleVersion: BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
		});
		expect(repository.save).toHaveBeenCalledWith([debit, credit]);
	});
	it('does not write an already reconciled pair again', async () => {
		const event = {
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER,
			financialEventRuleVersion: BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
		};
		const debit = transaction({
			id: 'debit',
			amount: '-100.00000000',
			creditDebitIndicator: 'DBIT',
			...event,
			bankAccount: {
				id: 'account-a',
				accountIdentifier: {scheme: 'IBAN', value: 'NL91ABNA0417164300'},
				bankConnection: {id: 'connection-a', aspspName: 'Synthetic Bank'},
			},
			counterpartyAccountIdentifier: {scheme: 'IBAN', value: 'NL20RABO0123456789'},
		});
		const credit = transaction({
			id: 'credit',
			...event,
			bankAccount: {
				id: 'account-b',
				accountIdentifier: {scheme: 'IBAN', value: 'NL20RABO0123456789'},
				bankConnection: {id: 'connection-b', aspspName: 'Synthetic Bank'},
			},
			counterpartyAccountIdentifier: {scheme: 'IBAN', value: 'NL91ABNA0417164300'},
		});
		const {manager, repository} = createManager([debit, credit]);

		await expect(reconcileBankTransactionInternalTransfers(manager, 'owner-id')).resolves.toEqual([]);
		expect(repository.save).not.toHaveBeenCalled();
	});

	it('re-evaluates a pair classified by the previous rule version', async () => {
		const debit = transaction({
			id: 'debit',
			amount: '-100.00000000',
			creditDebitIndicator: 'DBIT',
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER,
			financialEventRuleVersion: 'internal-transfer-v1',
			bankAccount: {
				id: 'account-a',
				accountIdentifier: {scheme: 'IBAN', value: 'NL91ABNA0417164300'},
				bankConnection: {id: 'connection-a', aspspName: 'Synthetic Bank'},
			},
			counterpartyAccountIdentifier: {scheme: 'IBAN', value: 'NL20RABO0123456789'},
		});
		const credit = transaction({
			id: 'credit',
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER,
			financialEventRuleVersion: 'internal-transfer-v1',
			bankAccount: {
				id: 'account-b',
				accountIdentifier: {scheme: 'IBAN', value: 'NL20RABO0123456789'},
				bankConnection: {id: 'connection-b', aspspName: 'Synthetic Bank'},
			},
			counterpartyAccountIdentifier: {scheme: 'IBAN', value: 'NL91ABNA0417164300'},
		});
		const {manager, repository} = createManager([debit, credit]);

		await expect(reconcileBankTransactionInternalTransfers(manager, 'owner-id')).resolves.toEqual([
			'debit',
			'credit',
		]);
		expect(debit.financialEventRuleVersion).toBe(BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION);
		expect(credit.financialEventRuleVersion).toBe(BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION);
		expect(repository.save).toHaveBeenCalledWith([debit, credit]);
	});

	it('clears a stale internal event and requeues the ordinary transaction', async () => {
		const stale = transaction({
			id: 'stale',
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.INTERNAL_TRANSFER,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.MATCHER,
			financialEventRuleVersion: BANK_TRANSACTION_INTERNAL_TRANSFER_RULE_VERSION,
			bankAccount: {
				id: 'account-a',
				accountIdentifier: {scheme: 'IBAN', value: 'NL91ABNA0417164300'},
				bankConnection: {id: 'connection-a', aspspName: 'Synthetic Bank'},
			},
			counterpartyAccountIdentifier: {scheme: 'IBAN', value: 'NL30OTHER0000000000'},
		});
		const {manager, repository} = createManager([stale]);

		await expect(reconcileBankTransactionInternalTransfers(manager, 'owner-id')).resolves.toEqual(['stale']);
		expect(stale).toMatchObject({
			financialEventType: null,
			financialEventSource: null,
			financialEventRuleVersion: null,
			categoryStatus: 'PENDING',
			categorySource: null,
			categoryInputHash: expect.any(String),
		});
		expect(repository.save).toHaveBeenCalledWith([stale]);
	});
});
