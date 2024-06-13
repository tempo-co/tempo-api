import { Transaction } from 'src/transaction/models/transaction.model';
import { BankTransactionAdapter } from '../bank-transaction-adapter.interface';

type RevolutTransaction = {
  type: string;
  product: string;
  startedDate: string;
  completedDate: string;
  description: string;
  amount: string;
  fee: string;
  currency: string;
  state: string;
  balance: string;
};

export class RevolutTransactionAdapter implements BankTransactionAdapter {
  map(data: RevolutTransaction[]): Transaction[] {
    return data.map((txn) => {
      const transaction = new Transaction();
      transaction.startedDate = new Date(txn.startedDate);
      transaction.completedDate = new Date(txn.completedDate);
      transaction.description = txn.description.replace(/\s+/g, ' ').trim();
      transaction.amount = parseFloat(txn.amount);
      transaction.currency = txn.currency;
      return transaction;
    });
  }
}
