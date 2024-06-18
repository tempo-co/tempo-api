import {validate} from 'class-validator';
import {InputTransactionCreate} from '@modules/transactions/graphql/transaction-create.input';

export abstract class TransactionMapper {
  /**
   * Abstract method to be implemented by specific BankTransactionMappers.
   */
  abstract map(data: unknown[]): Promise<InputTransactionCreate[]>;

  async validateTransaction(transaction: InputTransactionCreate): Promise<void> {
    const validationErrors = await validate(transaction);

    if (validationErrors.length > 0) {
      throw new Error('Validation failed for a transaction: ' + validationErrors.toString());
    }
  }
}
