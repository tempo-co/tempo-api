import { TransactionMapper } from '../transaction-mapper.abstract';
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

export class RevolutTransactionMapper extends TransactionMapper {
  async map(data: RevolutTransaction[]) {
    const transactions: CreateTransactionDto[] = [];

    for (const rawTxn of data) {
      const transaction: CreateTransactionDto = {
        startedDate: new Date(rawTxn.startedDate),
        completedDate: new Date(rawTxn.completedDate),
        description: rawTxn.description.replace(/\s+/g, ' ').trim(),
        amount: parseFloat(rawTxn.amount),
        currency: rawTxn.currency,
      };

      await super.validateTransaction(transaction);
      transactions.push(transaction);
    }
    return transactions;
  }
}
