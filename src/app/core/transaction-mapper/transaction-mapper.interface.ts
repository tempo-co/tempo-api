import {Transaction} from '@entities/transaction/transaction.entity';

export interface TransactionMapper {
  map(data: unknown): Partial<Transaction>;
}
