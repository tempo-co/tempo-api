import {Module} from '@nestjs/common';
import {FileParserFactory} from './file-parser.factory';
import {XlsFileParser} from './impl/xls-file-parser';
import {CsvFileParser} from './impl/csv-file-parser';
import {FileParserService} from './file-parser.service';

@Module({
  providers: [XlsFileParser, CsvFileParser, FileParserFactory, FileParserService],
  exports: [FileParserService],
})
export class FileParserModule {}
