import {Module} from '@nestjs/common';
import {StatementService} from './services/statement.service';
import {StatementResolver} from './graphql/bank-statement.mutations.resolver';
import {Statement} from '../../../../entities/statement/statement.entity';
import {TypeOrmModule} from '@nestjs/typeorm';
import {AccountModule} from '../accounts/account.module';
import {FileParserModule} from '../../../../core/file-parser/file-parser.module';
import {TransactionMapperModule} from '../../../../core/transaction-mapper/transaction-mapper.module';
import {TransactionModule} from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Statement]),
    AccountModule,
    FileParserModule,
    TransactionMapperModule,
    TransactionModule,
  ],
  providers: [StatementService, StatementResolver],
})
export class StatementModule {}
