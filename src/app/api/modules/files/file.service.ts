import {Injectable} from '@nestjs/common';

import {File} from '@entities/file/file.entity';
import {FileRepository} from '@entities/file/file.repository';

@Injectable()
export class FileService {
  constructor(private readonly fileRepository: FileRepository) {}

  save(file: Express.Multer.File): Promise<File> {
    return this.fileRepository.save({
      buffer: file.buffer,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    });
  }
}
