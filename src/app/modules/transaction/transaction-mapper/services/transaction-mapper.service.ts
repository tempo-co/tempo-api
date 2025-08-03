import {Injectable, UnprocessableEntityException} from '@nestjs/common';
import {validate} from 'class-validator';

import {BankAccount} from '@modules/bank-account/bank-account.entity';

import {TransactionMapperFactory} from './transaction-mapper.factory';
import {TransactionCreateDto} from './transaction-mapper.interface';

@Injectable()
export class TransactionMapperService {
	constructor(private readonly transactionMapperFactory: TransactionMapperFactory) {}

	async map(records: Record<string, string>[], bankAccount: BankAccount): Promise<TransactionCreateDto[]> {
		const mapper = this.transactionMapperFactory.create(bankAccount.bank);

		const transactions = await Promise.all(
			records.map(async (rawTransaction) => {
				const transaction = mapper.map(rawTransaction);

				if (transaction.currency !== bankAccount.currency) {
					throw new UnprocessableEntityException(
						`The file's currency (${transaction.currency}) does not match the bank account's currency (${bankAccount.currency}).`,
					);
				}

				const validationErrors = await validate(transaction);

				if (validationErrors.length > 0) {
					throw new UnprocessableEntityException(`File is not a valid ${bankAccount.bank} bank statement.`);
				}
				return transaction;
			}),
		);

		if (transactions.length === 0) {
			throw new UnprocessableEntityException('File does not contain any valid transactions.');
		}
		return transactions;
	}
}
