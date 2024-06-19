import {BadRequestException, Injectable} from '@nestjs/common';
import {InputTransactionCreate} from '@modules/transactions/graphql/transaction-create.input';
import {TransactionMapperFactory} from './transaction-mapper.factory';
import {Bank} from './models/bank.enum';
import {validate} from 'class-validator';

@Injectable()
export class TransactionMapperService {
  constructor(private readonly transactionMapperFactory: TransactionMapperFactory) {}

  async map(data: unknown[], bank: Bank): Promise<InputTransactionCreate[]> {
    const mapper = this.transactionMapperFactory.create(bank);
    // TODO: Don't use InputTransactionCreate
    const transactions = await Promise.all(
      data.map(async (rawTransaction) => {
        const transaction = mapper.map(rawTransaction);

        const validationErrors = await validate(transaction);

        if (validationErrors.length > 0) {
          throw new BadRequestException(
            'Validation failed for a transaction: ' + validationErrors.toString(),
          );
        }
        return transaction;
      }),
    );
    return transactions;
  }
}
