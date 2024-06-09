import { Transaction } from 'src/transaction/model/transaction.model';

export interface BankTransactionAdapter {
  map(data: unknown[]): Transaction[];
}
