import {Injectable, NotFoundException} from '@nestjs/common';

import {MimeType} from '@core/file-parser/constants/mime-type.enum';

import {File} from '../file.entity';
import {FileRepository} from '../repository/file.repository';

@Injectable()
export class FileService {
  constructor(private readonly fileRepository: FileRepository) {}

  save(file: Express.Multer.File): Promise<File> {
    return this.fileRepository.save({
      buffer: file.buffer,
      name: file.originalname,
      size: file.size,
      type: file.mimetype as MimeType,
    });
  }

  async deleteById(id: File['id']) {
    return this.fileRepository.deleteById(id);
  }

  async findById(id: File['id']) {
    const file = await this.fileRepository.findById(id);

    if (!file) {
      throw new NotFoundException(`File with id ${id} not found.`);
    }
    return file;
  }
}
