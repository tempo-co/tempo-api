import {Injectable} from '@nestjs/common';
import {TransactionMapperFactory} from './transaction-mapper.factory';
import {Bank} from './models/bank.enum';
import {InputTransactionCreate} from '../../api/graphql/modules/transactions/graphql/transaction-create.input';

@Injectable()
export class TransactionMapperService {
  constructor(private readonly transactionMapperFactory: TransactionMapperFactory) {}

  async map(data: unknown[], bank: Bank): Promise<InputTransactionCreate[]> {
    const mapper = this.transactionMapperFactory.create(bank);
    const transactions = await mapper.map(data);
    return transactions;
  }
}
