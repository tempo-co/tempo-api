import { Transaction } from 'src/transaction/models/transaction.model';

export interface BankTransactionAdapter {
  map(data: unknown[]): Transaction[];
}
