import { validate } from 'class-validator';
import { CreateTransactionDto } from '../transaction/dto/create-transaction.dto';

export abstract class BankTransactionAdapter {
  /**
   * Abstract method to be implemented by specific BankTransactionAdapters.
   */
  abstract map(data: unknown[]): Promise<CreateTransactionDto[]>;

  async validateTransaction(transaction: CreateTransactionDto): Promise<void> {
    const validationErrors = await validate(transaction);

    if (validationErrors.length > 0) {
      throw new Error(
        'Validation failed for a transaction: ' + validationErrors.toString(),
      );
    }
  }
}
