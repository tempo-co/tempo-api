import {Transaction} from '@entities/transaction/transaction.entity';

export interface TransactionMapper {
  map(data: Record<string, string>): TransactionPartial;
}
export type TransactionPartial = Pick<
  Transaction,
  'startedDate' | 'completedDate' | 'description' | 'amount' | 'currency'
>;
