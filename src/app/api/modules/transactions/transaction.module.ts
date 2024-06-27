import {Module} from '@nestjs/common';

import {TransactionRepositoryModule} from '@entities/transaction/transaction.repository.module';

import {TransactionController} from './transaction.controller';
import {TransactionService} from './transaction.service';

@Module({
  imports: [TransactionRepositoryModule],
  providers: [TransactionService],
  controllers: [TransactionController],
  exports: [TransactionService],
})
export class TransactionModule {}
