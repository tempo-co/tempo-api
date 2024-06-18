import {InputTransactionCreate} from '@modules/transactions/graphql/transaction-create.input';
import {TransactionMapper} from '../transaction-mapper.abstract';

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
    //TODO: Temp fix for now, but let's not use InputTypes as types for variables
    const transactions: InputTransactionCreate[] = [];

    for (const rawTxn of data) {
      const transaction: InputTransactionCreate = {
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
