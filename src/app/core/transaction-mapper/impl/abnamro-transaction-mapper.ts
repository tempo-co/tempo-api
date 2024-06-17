import {TransactionMapper} from '../transaction-mapper.abstract';
import {InputTransactionCreate} from 'src/app/api/graphql/modules/transactions/graphql/transaction-create.input';

type AbnAmroTransaction = {
  transactiondate: string;
  valuedate: string;
  startsaldo: string;
  endsaldo: string;
  description: string;
  amount: string;
  mutationcode: string;
};

export class AbnAmroTransactionMapper extends TransactionMapper {
  async map(data: AbnAmroTransaction[]) {
    const transactions: InputTransactionCreate[] = [];

    for (const rawTxn of data) {
      const transaction: InputTransactionCreate = {
        startedDate: this.parseDate(rawTxn.transactiondate),
        completedDate: this.parseDate(rawTxn.valuedate),
        description: rawTxn.description.replace(/\s+/g, ' ').trim(),
        amount: parseFloat(rawTxn.amount),
        currency: rawTxn.mutationcode,
      };

      await super.validateTransaction(transaction);
      transactions.push(transaction);
    }
    return transactions;
  }

  private parseDate(dateString: string): Date {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    return new Date(year, month, day);
  }
}
