import {InputTransactionCreate} from '@modules/transactions/graphql/transaction-create.input';
import {TransactionMapper} from '../transaction-mapper.interface';

type AbnAmroTransaction = {
  transactiondate: string;
  valuedate: string;
  startsaldo: string;
  endsaldo: string;
  description: string;
  amount: string;
  mutationcode: string;
};

export class AbnAmroTransactionMapper implements TransactionMapper {
  map(transaction: AbnAmroTransaction): InputTransactionCreate {
    return {
      startedDate: this.parseDate(transaction.transactiondate),
      completedDate: this.parseDate(transaction.valuedate),
      description: transaction.description.replace(/\s+/g, ' ').trim(),
      amount: parseFloat(transaction.amount),
      currency: transaction.mutationcode,
    };
  }

  private parseDate(dateString: string): Date {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    return new Date(year, month, day);
  }
}
