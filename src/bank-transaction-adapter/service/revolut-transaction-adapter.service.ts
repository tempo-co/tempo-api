import { Transaction } from 'src/transaction/model/transaction.model';
import { BankTransactionAdapter } from '../bank-transaction-adapter.interface';
import { NotImplementedException } from '@nestjs/common';

export class RevolutTransactionAdapter implements BankTransactionAdapter {
  map(): Transaction[] {
    throw new NotImplementedException();
  }
}
