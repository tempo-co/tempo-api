import {Transaction} from '@entities/transaction/transaction.entity';

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
  map(transaction: RevolutTransaction): Transaction {
    return new Transaction({
      startedDate: new Date(transaction.startedDate),
      completedDate: new Date(transaction.completedDate),
      description: transaction.description.replace(/\s+/g, ' ').trim(),
      amount: parseFloat(transaction.amount),
      currency: transaction.currency,
    });
  }
}
