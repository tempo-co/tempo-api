import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {File} from './file.entity';
import {FileRepository} from './file.repository';

@Module({
  imports: [TypeOrmModule.forFeature([File])],
  providers: [FileRepository],
  exports: [FileRepository],
})
export class FileRepositoryModule {}
