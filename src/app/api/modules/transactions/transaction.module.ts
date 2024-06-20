import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {Transaction} from '@entities/transaction/transaction.entity';

import {TransactionQueriesResolver} from './graphql/transaction.queries.resolver';
import {TransactionService} from './services/transaction.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction])],
  providers: [TransactionService, TransactionQueriesResolver],
  exports: [TransactionService],
})
export class TransactionModule {}
