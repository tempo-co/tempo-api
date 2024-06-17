import { Injectable } from '@nestjs/common';
import { FileParserFactory } from './file-parser.factory';

@Injectable()
export class FileParserService {
  constructor(private readonly fileParserFactory: FileParserFactory) {}

  parse(buffer: Buffer, mimetype: string): unknown[] {
    const fileParser = this.fileParserFactory.create(mimetype);
    const data = fileParser.parse(buffer);
    return data;
  }
}
