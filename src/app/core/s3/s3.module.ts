import {S3Client} from '@aws-sdk/client-s3';
import {Global, Module} from '@nestjs/common';

import {ConfigurationService} from '@core/config/config.service';

import {S3Service} from './s3.service';

@Global()
@Module({
	providers: [
		S3Service,
		{
			provide: S3Client,
			inject: [ConfigurationService],
			useFactory: (config: ConfigurationService) => {
				return new S3Client({
					region: config.get('S3_REGION'),
					endpoint: config.get('S3_ENDPOINT'),
					forcePathStyle: true,
					credentials: {
						accessKeyId: config.get('MINIO_ROOT_USER'),
						secretAccessKey: config.get('MINIO_ROOT_PASSWORD'),
					},
				});
			},
		},
	],
	exports: [S3Client, S3Service],
})
export class S3Module {}
