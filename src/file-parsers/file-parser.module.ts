import { Module } from '@nestjs/common';
import { FileParserFactory } from './file-parser.factory';
import { XlsFileParser } from './service/xls-file-parser.service';
import { FileParserResolver } from './file-parser.resolver';
import { TransactionMapperModule } from 'src/transaction-adapter/transaction-mapper.module';

@Module({
  imports: [TransactionMapperModule],
  providers: [XlsFileParser, FileParserFactory, FileParserResolver],
})
export class FileParserModule {}
