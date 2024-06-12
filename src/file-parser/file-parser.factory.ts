import { Injectable } from '@nestjs/common';
import { FileParser } from './file-parser.interface';
import { XlsFileParser } from './service/xls-file-parser.service';
import { CsvFileParser } from './service/csv-file-parser.service';

@Injectable()
export class FileParserFactory {
  constructor(
    private readonly xlsParser: XlsFileParser,
    private readonly csvParser: CsvFileParser,
  ) {}

  create(mimetype: string): FileParser {
    switch (mimetype) {
      case 'application/vnd.ms-excel':
        return this.xlsParser;
      case 'text/csv':
        return this.csvParser;
      default:
        throw new Error(`Unsupported file type: ${mimetype}`);
    }
  }
}
