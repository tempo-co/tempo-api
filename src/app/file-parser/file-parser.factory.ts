import { Injectable } from '@nestjs/common';
import { FileParser } from './file-parser.interface';
import { XlsFileParser } from './impl/xls-file-parser';
import { CsvFileParser } from './impl/csv-file-parser';

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
