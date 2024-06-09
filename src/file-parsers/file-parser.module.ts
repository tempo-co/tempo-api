import { Module } from '@nestjs/common';
import { FileParserFactory } from './file-parser.factory';
import { XlsFileParser } from './service/xls-file-parser.service';
import { FileParserResolver } from './file-parser.resolver';
import { TransactionAdapterModule } from 'src/bank-transaction-adapter/bank-transaction-adapter.module';

@Module({
  imports: [TransactionAdapterModule],
  providers: [XlsFileParser, FileParserFactory, FileParserResolver],
})
export class FileParserModule {}
