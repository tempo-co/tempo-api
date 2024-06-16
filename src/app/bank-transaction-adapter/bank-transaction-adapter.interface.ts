import { CreateTransactionDto } from '../transaction/dto/create-transaction.dto';

export interface BankTransactionAdapter {
  map(data: unknown[]): CreateTransactionDto[];
}
