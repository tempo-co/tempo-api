import {InputTransactionCreate} from '@modules/transactions/graphql/transaction-create.input';
import {TransactionMapper} from '../transaction-mapper.interface';

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

export class RevolutTransactionMapper implements TransactionMapper {
  map(transaction: RevolutTransaction): InputTransactionCreate {
    return {
      startedDate: new Date(transaction.startedDate),
      completedDate: new Date(transaction.completedDate),
      description: transaction.description.replace(/\s+/g, ' ').trim(),
      amount: parseFloat(transaction.amount),
      currency: transaction.currency,
    };
  }
}
