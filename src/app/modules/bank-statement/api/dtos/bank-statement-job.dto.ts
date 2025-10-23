import {Account} from '@modules/account/account.entity';
import {BankAccount} from '@modules/bank-account/bank-account.entity';

export interface BankStatementJob {
	file: Pick<Express.Multer.File, 'buffer' | 'originalname' | 'mimetype' | 'size'>;
	bankAccountId: BankAccount['id'];
	accountId: Account['id'];
}
