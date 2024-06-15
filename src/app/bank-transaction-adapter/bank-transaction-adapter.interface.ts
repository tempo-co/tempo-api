import { Transaction } from 'src/app/transaction/models/transaction.model';

export interface BankTransactionAdapter {
  map(data: unknown[]): Transaction[];
}
