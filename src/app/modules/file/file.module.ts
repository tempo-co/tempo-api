import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {S3Module} from '@core/s3/s3.module';

import {FileController} from './file.controller';
import {File} from './file.entity';
import {FileService} from './file.service';

@Module({
	imports: [TypeOrmModule.forFeature([File]), S3Module],
	controllers: [FileController],
	providers: [FileService],
	exports: [FileService],
})
export class FileModule {}
