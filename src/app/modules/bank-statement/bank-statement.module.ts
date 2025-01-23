import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {FileParserModule} from '@core/file-parser/file-parser.module';
import {TransactionCategorizerModule} from '@core/transaction-categorizer/transaction-categorizer.module';
import {TransactionMapperModule} from '@core/transaction-mapper/transaction-mapper.module';
import {FileModule} from '@modules/file/file.module';

import {AccountModule} from '../account/account.module';
import {TransactionModule} from '../transaction/transaction.module';
import {BankStatementController} from './api/bank-statement.controller';
import {BankStatement} from './bank-statement.entity';
import {BankStatementService} from './bank-statement.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankStatement]),
    AccountModule,
    FileParserModule,
    TransactionMapperModule,
    TransactionCategorizerModule,
    TransactionModule,
    FileModule,
  ],
  providers: [BankStatementService],
  controllers: [BankStatementController],
})
export class BankStatementModule {}
