import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {BankTransaction} from '../bank-transaction.entity';
import {BankTransactionRuleController} from './bank-transaction-rule.controller';
import {BankTransactionRule} from './bank-transaction-rule.entity';
import {BankTransactionRuleService} from './bank-transaction-rule.service';

@Module({
	imports: [TypeOrmModule.forFeature([BankTransaction, BankTransactionRule])],
	providers: [BankTransactionRuleService],
	controllers: [BankTransactionRuleController],
	exports: [BankTransactionRuleService],
})
export class BankTransactionRuleModule {}
