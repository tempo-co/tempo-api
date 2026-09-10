import {ObjectLiteral, Repository, SelectQueryBuilder} from 'typeorm';

import {BankTransactionResponseDto} from '../api/dtos/bank-transaction-response.dto';
import {BankConnection} from '../bank-connection.entity';
import {BankTransaction} from '../bank-transaction.entity';
import {BankTransactionService} from './bank-transaction.service';

function createTransaction(): BankTransaction {
	return {
		id: 'transaction-id',
		description: 'SEPA Overboeking IBAN: GB00TEST BIC: TESTGB21 Naam: Example Payee Kenmerk: NOTPROVIDED',
		displayDescription: 'Example Payee',
		counterpartyName: null,
		bankAccount: {
			name: 'Example account',
			alias: null,
			bankConnection: {
				aspspName: 'Example Bank',
				aspspCountry: 'NL',
			},
		},
	} as unknown as BankTransaction;
}

function createQueryBuilder<T extends ObjectLiteral>(): SelectQueryBuilder<T> & {
	getOne: jest.Mock;
	getManyAndCount: jest.Mock;
} {
	const queryBuilder = {
		innerJoinAndSelect: jest.fn().mockReturnThis(),
		innerJoin: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		orderBy: jest.fn().mockReturnThis(),
		addOrderBy: jest.fn().mockReturnThis(),
		skip: jest.fn().mockReturnThis(),
		take: jest.fn().mockReturnThis(),
		getOne: jest.fn(),
		getManyAndCount: jest.fn(),
	};
	return queryBuilder as unknown as SelectQueryBuilder<T> & {
		getOne: jest.Mock;
		getManyAndCount: jest.Mock;
	};
}

describe('BankTransactionService display descriptions', () => {
	it('includes a concise display description in detailed responses while preserving raw text', async () => {
		const transaction = createTransaction();
		const queryBuilder = createQueryBuilder<BankTransaction>();
		queryBuilder.getOne.mockResolvedValue(transaction);
		const repository = {createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)};
		const service = new BankTransactionService(
			{} as Repository<BankConnection>,
			repository as unknown as Repository<BankTransaction>,
		);

		const response = await service.findById('account-id', transaction.id);

		expect(response).toMatchObject<Partial<BankTransactionResponseDto>>({
			description: transaction.description,
			displayDescription: 'Example Payee',
		});
	});

	it('includes a concise display description in connection transaction summaries', async () => {
		const transaction = createTransaction();
		const queryBuilder = createQueryBuilder<BankTransaction>();
		queryBuilder.getManyAndCount.mockResolvedValue([[transaction], 1]);
		const repository = {createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)};
		const service = new BankTransactionService(
			{findOne: jest.fn().mockResolvedValue({id: 'connection-id'})} as unknown as Repository<BankConnection>,
			repository as unknown as Repository<BankTransaction>,
		);

		const response = await service.findAllByConnectionId('account-id', 'connection-id', 10);

		expect(response.transactions[0]).toMatchObject({
			description: transaction.description,
			displayDescription: 'Example Payee',
		});
	});
});
