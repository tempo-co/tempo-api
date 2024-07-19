import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {File} from './file.entity';

export type FileSaveOptions = Omit<File, 'id' | 'uploadedAt'>;

@Injectable()
export class FileRepository {
  constructor(
    @InjectRepository(File)
    private readonly repository: Repository<File>,
  ) {}

  save(file: FileSaveOptions): Promise<File> {
    return this.repository.save(file);
  }
}
