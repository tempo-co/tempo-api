import {
  Controller,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileParserFactory } from './file-parser.factory';

@Controller('file-parser')
export class FileParserController {
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async parse(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 1000 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    const parser = FileParserFactory.createParser(file.mimetype);
    return await parser.parse(file.buffer);
  }
}
