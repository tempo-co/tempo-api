import { Module } from '@nestjs/common';
import { FileParserController } from './file-parser.controller';
import { FileParserFactory } from './file-parser.factory';

@Module({
  controllers: [FileParserController],
  providers: [FileParserFactory],
})
export class FileParserModule {}
