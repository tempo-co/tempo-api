import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {FileParserModule} from '@core/file-parser/file-parser.module';
import {TransactionMapperModule} from '@core/transaction-mapper/transaction-mapper.module';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';

import {AccountModule} from '../accounts/account.module';
import {TransactionModule} from '../transactions/transaction.module';
import {BankStatementMutationsResolver} from './graphql/bank-statement.mutations.resolver';
import {BankStatementService} from './services/bank-statement.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankStatement]),
    AccountModule,
    FileParserModule,
    TransactionMapperModule,
    TransactionModule,
  ],
  providers: [BankStatementService, BankStatementMutationsResolver],
})
export class BankStatementModule {}
