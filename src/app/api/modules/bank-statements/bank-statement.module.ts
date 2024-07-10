import {Module} from '@nestjs/common';

import {FileParserModule} from '@core/file-parser/file-parser.module';
import {TransactionCategorizerModule} from '@core/transaction-categorizer/transaction-categorizer.module';
import {TransactionMapperModule} from '@core/transaction-mapper/transaction-mapper.module';
import {BankStatementRepositoryModule} from '@entities/bank-statement/bank-statement.repository.module';

import {AccountModule} from '../accounts/account.module';
import {TransactionModule} from '../transactions/transaction.module';
import {BankStatementController} from './bank-statement.controller';
import {BankStatementService} from './bank-statement.service';

@Module({
  imports: [
    BankStatementRepositoryModule,
    AccountModule,
    FileParserModule,
    TransactionMapperModule,
    TransactionCategorizerModule,
    TransactionModule,
  ],
  providers: [BankStatementService],
  controllers: [BankStatementController],
})
export class BankStatementModule {}
