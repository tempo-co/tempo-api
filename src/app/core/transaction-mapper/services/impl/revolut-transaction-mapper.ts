import {UnprocessableEntityException} from '@nestjs/common';
import Joi from 'joi';

import {currencyCodes} from '@core/transaction-mapper/constants/currency-codes';

import {TransactionMapper, TransactionPartial} from '../transaction-mapper.interface';

export type RevolutTransaction = {
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

const revolutTransactionSchema = Joi.object({
  type: Joi.optional(),
  product: Joi.optional(),
  startedDate: Joi.string().isoDate().required(),
  completedDate: Joi.string().isoDate().required(),
  description: Joi.string().required(),
  amount: Joi.string()
    .pattern(/^-?\d+(\.\d{1,2})?$/)
    .required(),
  fee: Joi.optional(),
  currency: Joi.string()
    .valid(...currencyCodes)
    .required(),
  state: Joi.optional(),
  balance: Joi.optional(),
});

export class RevolutTransactionMapper implements TransactionMapper {
  map(transaction: RevolutTransaction): TransactionPartial {
    const {error} = revolutTransactionSchema.validate(transaction);
    if (error) {
      throw new UnprocessableEntityException(
        `Validation failed for a transaction. Invalid schema: ${error.message}`,
      );
    }

    return {
      startedAt: new Date(transaction.startedDate),
      completedAt: new Date(transaction.completedDate),
      description: transaction.description.replace(/\s+/g, ' ').trim(),
      amount: parseFloat(transaction.amount),
      currency: transaction.currency,
    };
  }
}
