import { Transaction } from 'src/transaction/models/transaction.model';
import { BankTransactionAdapter } from '../bank-transaction-adapter.interface';

type AbnAmroTransaction = {
  transactiondate: string;
  valuedate: string;
  startsaldo: string;
  endsaldo: string;
  description: string;
  amount: string;
  mutationcode: string;
};

export class AbnAmroTransactionAdapter implements BankTransactionAdapter {
  map(data: AbnAmroTransaction[]): Transaction[] {
    return data.map((txn) => {
      const transaction = new Transaction();
      transaction.startedDate = this.parseDate(txn.transactiondate);
      transaction.completedDate = this.parseDate(txn.valuedate);
      transaction.description = txn.description.replace(/\s+/g, ' ').trim();
      transaction.amount = parseFloat(txn.amount);
      transaction.currency = txn.mutationcode;
      return transaction;
    });
  }

  private parseDate(dateString: string): Date {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    return new Date(year, month, day);
  }
}
