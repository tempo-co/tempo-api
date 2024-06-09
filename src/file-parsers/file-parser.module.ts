import { Module } from '@nestjs/common';
import { FileParserFactory } from './file-parser.factory';
import { XlsParser } from './service/xls-parser.service';
import { FileParserResolver } from './file-parser.resolver';

@Module({
  providers: [XlsParser, FileParserFactory, FileParserResolver],
})
export class FileParserModule {}
