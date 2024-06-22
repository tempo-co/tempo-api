import {Module} from '@nestjs/common';

import {FileParserFactory} from './services/file-parser.factory';
import {FileParserService} from './services/file-parser.service';
import {CsvFileParser} from './services/impl/csv-file-parser';
import {XlsFileParser} from './services/impl/xls-file-parser';

@Module({
  providers: [FileParserService, FileParserFactory, XlsFileParser, CsvFileParser],
  exports: [FileParserService],
})
export class FileParserModule {}
