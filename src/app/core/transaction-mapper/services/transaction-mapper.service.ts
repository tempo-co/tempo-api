import {Injectable, UnprocessableEntityException} from '@nestjs/common';
import {validate} from 'class-validator';

import {Bank} from '../constants/bank.enum';
import {TransactionMapperFactory} from './transaction-mapper.factory';
import {TransactionPartial} from './transaction-mapper.interface';

@Injectable()
export class TransactionMapperService {
  constructor(private readonly transactionMapperFactory: TransactionMapperFactory) {}

  async map(records: Record<string, string>[], bank: Bank): Promise<TransactionPartial[]> {
    const mapper = this.transactionMapperFactory.create(bank);

    const transactions = await Promise.all(
      records.map(async (rawTransaction) => {
        const transaction = mapper.map(rawTransaction);

        const validationErrors = await validate(transaction);

        if (validationErrors.length > 0) {
          throw new UnprocessableEntityException(`File is not a valid ${bank} bank statement.`);
        }
        return transaction;
      }),
    );
    return transactions;
  }
}
