import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionResolver } from './transaction.resolver';

@Module({
  providers: [TransactionService, TransactionResolver],
})
export class TransactionModule {}
