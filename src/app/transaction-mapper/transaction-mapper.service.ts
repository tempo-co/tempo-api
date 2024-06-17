import { Injectable } from '@nestjs/common';
import { TransactionMapperFactory } from './transaction-mapper.factory';
import { Bank } from './models/bank.enum';
import { CreateTransactionDto } from '../transaction/dto/create-transaction.dto';

@Injectable()
export class TransactionMapperService {
  constructor(
    private readonly transactionMapperFactory: TransactionMapperFactory,
  ) {}

  async map(data: unknown[], bank: Bank): Promise<CreateTransactionDto[]> {
    const mapper = this.transactionMapperFactory.create(bank);
    const transactions = await mapper.map(data);
    return transactions;
  }
}
