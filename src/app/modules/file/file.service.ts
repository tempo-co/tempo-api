import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {MimeType} from '@core/file-parser/constants/mime-type.enum';

import {File} from './file.entity';

@Injectable()
export class FileService {
  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,
  ) {}

  async save(file: Express.Multer.File): Promise<File> {
    return this.fileRepository.save({
      buffer: file.buffer,
      name: file.originalname,
      size: file.size,
      type: file.mimetype as MimeType,
    });
  }

  async deleteById(id: File['id']) {
    return this.fileRepository.delete(id);
  }

  async findById(id: File['id']) {
    const file = await this.fileRepository.findOne({
      where: {id},
      select: ['id', 'buffer', 'name', 'size', 'type'],
    });

    if (!file) {
      throw new NotFoundException(`File not found.`);
    }
    return file;
  }
}
