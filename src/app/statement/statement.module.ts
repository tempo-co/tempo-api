import { Module } from '@nestjs/common';
import { StatementService } from './statement.service';
import { StatementResolver } from './statement.resolver';
import { Statement } from './entities/statement.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from '../account/account.module';
import { FileParserModule } from '../file-parser/file-parser.module';
import { BankTransactionAdapterModule } from '../bank-transaction-adapter/bank-transaction-adapter.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Statement]),
    AccountModule,
    FileParserModule,
    BankTransactionAdapterModule,
    TransactionModule,
  ],
  providers: [StatementService, StatementResolver],
})
export class StatementModule {}
