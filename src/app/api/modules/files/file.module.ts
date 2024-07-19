import {Module} from '@nestjs/common';

import {FileRepositoryModule} from '@entities/file/file.repository.module';

import {FileService} from './file.service';

@Module({
  imports: [FileRepositoryModule],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
