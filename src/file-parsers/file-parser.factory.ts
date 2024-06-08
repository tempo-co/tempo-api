import { FileParser } from './file-parser.interface';
import { XlsParser } from './service/xls-parser.service';

export class FileParserFactory {
  private static parsers: { [key: string]: new () => FileParser } = {
    'application/vnd.ms-excel': XlsParser,
  };

  static createParser(fileType: string): FileParser {
    const Parser = this.parsers[fileType];
    if (!Parser) {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
    return new Parser();
  }
}
