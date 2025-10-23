import {BullModule} from '@nestjs/bullmq';
import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {BANK_STATEMENT_QUEUE} from '@core/queue/queue.constants';
import {FileParserModule} from '@modules/file/file-parser/file-parser.module';
import {FileModule} from '@modules/file/file.module';
import {TransactionCategorizerModule} from '@modules/transaction/transaction-categorizer/transaction-categorizer.module';
import {TransactionMapperModule} from '@modules/transaction/transaction-mapper/transaction-mapper.module';

import {BankAccountModule} from '../bank-account/bank-account.module';
import {TransactionModule} from '../transaction/transaction.module';
import {BankStatementController} from './api/bank-statement.controller';
import {BankStatement} from './bank-statement.entity';
import {BankStatementProcessor} from './bank-statement.processor';
import {BankStatementService} from './bank-statement.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([BankStatement]),
		BankAccountModule,
		FileParserModule,
		TransactionMapperModule,
		TransactionCategorizerModule,
		TransactionModule,
		FileModule,
		BullModule.registerQueue({name: BANK_STATEMENT_QUEUE}),
	],
	providers: [BankStatementService, BankStatementProcessor],
	controllers: [BankStatementController],
})
export class BankStatementModule {}
