import {UnprocessableEntityException} from '@nestjs/common';
import {z} from 'zod';

import {amountPattern} from '../../constants/amount.regex';
import {TransactionMapper, TransactionPartial} from '../transaction-mapper.interface';

const abnAmroTransactionSchema = z.object({
  accountNumber: z.string().optional(),
  mutationcode: z.string(),
  transactiondate: z.string().length(8),
  valuedate: z.string().length(8),
  startsaldo: z.string().optional(),
  endsaldo: z.string().optional(),
  amount: z.string().regex(amountPattern),
  description: z.string(),
});

export type AbnAmroTransaction = z.infer<typeof abnAmroTransactionSchema>;

export class AbnAmroTransactionMapper implements TransactionMapper {
  map(transaction: AbnAmroTransaction): TransactionPartial {
    const validationResult = abnAmroTransactionSchema.safeParse(transaction);
    if (!validationResult.success) {
      throw new UnprocessableEntityException('File is not a valid ABN AMRO bank statement.');
    }

    return {
      startedAt: this.parseDate(transaction.transactiondate),
      completedAt: this.parseDate(transaction.valuedate),
      description: transaction.description.replace(/\s+/g, ' ').trim(),
      amount: parseFloat(transaction.amount),
      currency: transaction.mutationcode,
    };
  }

  private parseDate(dateString: string): Date {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));

    const date = new Date(year, month, day);

    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
      throw new UnprocessableEntityException('File is not a valid ABN AMRO bank statement.');
    }
    return date;
  }
}
