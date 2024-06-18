import {Module} from '@nestjs/common';
import {XlsFileParser} from './impl/xls-file-parser';
import {CsvFileParser} from './impl/csv-file-parser';
import {FileParserFactory} from './file-parser.factory';
import {FileParserService} from './file-parser.service';

@Module({
  providers: [XlsFileParser, CsvFileParser, FileParserFactory, FileParserService],
  exports: [FileParserService],
})
export class FileParserModule {}
