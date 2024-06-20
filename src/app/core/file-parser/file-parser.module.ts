import {Module} from '@nestjs/common';

import {FileParserFactory} from './file-parser.factory';
import {FileParserService} from './file-parser.service';
import {CsvFileParser} from './impl/csv-file-parser';
import {XlsFileParser} from './impl/xls-file-parser';

@Module({
  providers: [XlsFileParser, CsvFileParser, FileParserFactory, FileParserService],
  exports: [FileParserService],
})
export class FileParserModule {}
