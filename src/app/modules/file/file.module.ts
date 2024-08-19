import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {File} from './file.entity';
import {FileRepository} from './repository/file.repository';
import {FileService} from './services/file.service';

@Module({
  imports: [TypeOrmModule.forFeature([File])],
  providers: [FileService, FileRepository],
  exports: [FileService],
})
export class FileModule {}
