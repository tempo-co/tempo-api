import {BadRequestException, Injectable} from '@nestjs/common';

import {MimeType} from '../constants/mime-type.enum';
import {FileParser} from './file-parser.interface';
import {CsvFileParser} from './impl/csv-file-parser';
import {XlsFileParser} from './impl/xls-file-parser';

@Injectable()
export class FileParserFactory {
  constructor(
    private readonly xlsParser: XlsFileParser,
    private readonly csvParser: CsvFileParser,
  ) {}

  create(mimetype: string): FileParser {
    switch (mimetype) {
      case MimeType.XLS:
      case MimeType.XLSX:
        return this.xlsParser;
      case MimeType.CSV:
        return this.csvParser;
      default:
        throw new BadRequestException(`Unsupported file type: ${mimetype}`);
    }
  }
}
