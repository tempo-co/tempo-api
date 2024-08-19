import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {TransactionController} from './api/transaction.controller';
import {TransactionRepository} from './repository/transaction.repository';
import {TransactionService} from './services/transaction.service';
import {Transaction} from './transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction])],
  providers: [TransactionService, TransactionRepository],
  controllers: [TransactionController],
  exports: [TransactionService],
})
export class TransactionModule {}
