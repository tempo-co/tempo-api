import {TransactionPartial} from '@modules/transactions/services/transaction.service';

export interface TransactionMapper {
  map(data: Record<string, string>): TransactionPartial;
}
