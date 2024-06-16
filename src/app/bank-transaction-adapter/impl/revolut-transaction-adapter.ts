import { BankTransactionAdapter } from '../bank-transaction-adapter.interface';
import { CreateTransactionDto } from 'src/app/transaction/dto/create-transaction.dto';

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
  map(data: RevolutTransaction[]) {
    const transactions: CreateTransactionDto[] = [];
    data.forEach((transaction) => {
      transactions.push({
        startedDate: new Date(transaction.startedDate),
        completedDate: new Date(transaction.completedDate),
        description: transaction.description.replace(/\s+/g, ' ').trim(),
        amount: parseFloat(transaction.amount),
        currency: transaction.currency,
      });
    });
    return transactions;
  }
}
