import {Transaction} from '@modules/transaction/transaction.entity';

export interface TransactionMapper {
	map(records: Record<string, string>): TransactionPartial;
}

export type TransactionPartial = Pick<Transaction, 'startedAt' | 'completedAt' | 'description' | 'amount' | 'currency'>;
