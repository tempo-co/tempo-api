import {InputTransactionCreate} from '@modules/transactions/graphql/transaction-create.input';

export interface TransactionMapper {
  map(data: unknown): InputTransactionCreate;
}
