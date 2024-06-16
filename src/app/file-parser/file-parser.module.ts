import { Module } from '@nestjs/common';
import { FileParserFactory } from './file-parser.factory';
import { XlsFileParser } from './impl/xls-file-parser';
import { CsvFileParser } from './impl/csv-file-parser';
import { FileParserResolver } from './file-parser.resolver';
import { BankTransactionAdapterModule } from 'src/app/bank-transaction-adapter/bank-transaction-adapter.module';
import { FileParserService } from './file-parser.service';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [BankTransactionAdapterModule, TransactionModule],
  providers: [
    XlsFileParser,
    CsvFileParser,
    FileParserFactory,
    FileParserService,
    FileParserResolver,
  ],
})
export class FileParserModule {}
