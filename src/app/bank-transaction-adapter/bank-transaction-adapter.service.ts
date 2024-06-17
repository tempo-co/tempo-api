import { Injectable } from '@nestjs/common';
import { BankTransactionAdapterFactory } from './bank-transaction-adapter.factory';
import { Bank } from './models/bank.model';
import { CreateTransactionDto } from '../transaction/dto/create-transaction.dto';

@Injectable()
export class BankTransactionAdapterService {
  constructor(
    private readonly bankTransactionAdapterFactory: BankTransactionAdapterFactory,
  ) {}

  async map(data: unknown[], bank: Bank): Promise<CreateTransactionDto[]> {
    const adapter = this.bankTransactionAdapterFactory.create(bank);
    const transactions = await adapter.map(data);
    return transactions;
  }
}
