import {Module} from '@nestjs/common';
import {BankStatementService} from './services/statement.service';
import {BankStatementResolver} from './graphql/bank-statement.mutations.resolver';
import {BankStatement} from '../../../../entities/bank-statement/statement.entity';
import {TypeOrmModule} from '@nestjs/typeorm';
import {AccountModule} from '../accounts/account.module';
import {FileParserModule} from '../../../../core/file-parser/file-parser.module';
import {TransactionMapperModule} from '../../../../core/transaction-mapper/transaction-mapper.module';
import {TransactionModule} from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankStatement]),
    AccountModule,
    FileParserModule,
    TransactionMapperModule,
    TransactionModule,
  ],
  providers: [BankStatementService, BankStatementResolver],
})
export class BankStatementModule {}
