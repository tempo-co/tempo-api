import {Injectable} from '@nestjs/common';

import {FileParserFactory} from './file-parser.factory';

@Injectable()
export class FileParserService {
  constructor(private readonly fileParserFactory: FileParserFactory) {}

  parse(buffer: Buffer, mimetype: string): Record<string, string>[] {
    const fileParser = this.fileParserFactory.create(mimetype);
    const records = fileParser.parse(buffer);
    return records;
  }
}
