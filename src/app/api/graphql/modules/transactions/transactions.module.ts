import {Module} from '@nestjs/common';
import {TransactionService} from './services/transaction.service';
import {TransactionResolver} from './graphql/transaction.queries.resolver';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Transaction} from '../../../../entities/transaction/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction])],
  providers: [TransactionService, TransactionResolver],
  exports: [TransactionService],
})
export class TransactionModule {}
