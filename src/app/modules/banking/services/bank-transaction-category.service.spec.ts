import {Repository} from 'typeorm';

import {BankConnection} from '../bank-connection.entity';
import {BankTransaction} from '../bank-transaction.entity';
import {BankTransactionService} from './bank-transaction.service';

function createTransaction(): BankTransaction {
	return {
		id: 'transaction-id',
		transactionDate: '2026-09-01',
		bookingDate: '2026-09-02',
		valueDate: '2026-09-03',
		amount: '-12.50',
		currency: 'EUR',
		creditDebitIndicator: 'DBIT',
		transactionType: 'CARD_PAYMENT',
		description: 'Coffee shop',
		displayDescription: 'Coffee shop',
		counterpartyName: 'Cafe',
		bankTransactionDescription: 'Card payment',
		merchantCategoryCode: '5814',
		remittanceInformation: 'Morning coffee',
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
		bankAccount: {
			name: 'Main account',
			alias: null,
			bankConnection: {aspspName: 'Example Bank', aspspCountry: 'NL'},
		},
	} as unknown as BankTransaction;
}

describe('BankTransactionService manual category updates', () => {
	it('updates only an owner transaction and marks it as manual with the current input hash', async () => {
		const transaction = createTransaction();
		const queryBuilder = {
			innerJoinAndSelect: jest.fn().mockReturnThis(),
			innerJoin: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			getOne: jest.fn().mockResolvedValue(transaction),
		};
		const repository = {
			createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
			update: jest.fn().mockResolvedValue({affected: 1}),
		};
		const service = new BankTransactionService(
			{} as unknown as Repository<BankConnection>,
			repository as unknown as Repository<BankTransaction>,
		);

		const response = await service.updateCategory('owner-account-id', transaction.id, 'FOOD_AND_DRINK');

		expect(repository.update).toHaveBeenCalledWith(
			{id: transaction.id},
			expect.objectContaining({
				category: 'FOOD_AND_DRINK',
				categoryStatus: 'COMPLETED',
				categorySource: 'MANUAL',
				categoryConfidence: null,
				categoryAppliedInputHash: expect.any(String),
				categoryProvider: null,
				categoryModel: null,
				categoryPromptVersion: null,
				categoryLastError: null,
			}),
		);
		expect(response).toMatchObject({
			id: transaction.id,
			category: 'FOOD_AND_DRINK',
			categoryStatus: 'COMPLETED',
			categorySource: 'MANUAL',
		});
	});
});
