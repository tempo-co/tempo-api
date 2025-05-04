import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {TransactionController} from './api/transaction.controller';
import {Transaction} from './transaction.entity';
import {TransactionService} from './transaction.service';

@Module({
	imports: [TypeOrmModule.forFeature([Transaction])],
	providers: [TransactionService],
	controllers: [TransactionController],
	exports: [TransactionService],
})
export class TransactionModule {}
