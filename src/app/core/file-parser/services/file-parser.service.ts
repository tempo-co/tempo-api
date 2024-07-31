import {BadRequestException, Injectable} from '@nestjs/common';

import {FileParserFactory} from './file-parser.factory';

@Injectable()
export class FileParserService {
  constructor(private readonly fileParserFactory: FileParserFactory) {}

  parse(buffer: Buffer, mimetype: string): Record<string, string>[] {
    const fileParser = this.fileParserFactory.create(mimetype);
    try {
      return fileParser.parse(buffer);
    } catch (error) {
      throw new BadRequestException(`Failed to parse file: ${error.message}`);
    }
  }
}
