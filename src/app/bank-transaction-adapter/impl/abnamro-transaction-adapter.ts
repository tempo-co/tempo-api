import { BankTransactionAdapter } from '../bank-transaction-adapter.interface';
import { CreateTransactionDto } from 'src/app/transaction/dto/create-transaction.dto';

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
  map(data: AbnAmroTransaction[]) {
    const transactions: CreateTransactionDto[] = [];
    data.forEach((transaction) => {
      transactions.push({
        startedDate: this.parseDate(transaction.transactiondate),
        completedDate: this.parseDate(transaction.valuedate),
        description: transaction.description.replace(/\s+/g, ' ').trim(),
        amount: parseFloat(transaction.amount),
        currency: transaction.mutationcode,
      });
    });
    return transactions;
  }

  private parseDate(dateString: string): Date {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    return new Date(year, month, day);
  }
}
