import {Module} from '@nestjs/common';

import {TransactionRepositoryModule} from '@entities/transaction/transaction.repository.module';

import {TransactionQueriesResolver} from './graphql/transaction.queries.resolver';
import {TransactionService} from './services/transaction.service';

@Module({
  imports: [TransactionRepositoryModule],
  providers: [TransactionService, TransactionQueriesResolver],
  exports: [TransactionService],
})
export class TransactionModule {}
