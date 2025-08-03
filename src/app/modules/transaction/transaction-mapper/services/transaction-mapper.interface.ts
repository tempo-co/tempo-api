import {BankAccount} from '@modules/bank-account/bank-account.entity';
import {Transaction} from '@modules/transaction/transaction.entity';

export interface TransactionMapper {
	map(records: Record<string, string>): TransactionCreateDto;
}

export type TransactionCreateDto = Pick<Transaction, 'startedAt' | 'completedAt' | 'description' | 'amount'> & {
	currency: BankAccount['currency'];
};
