import {
	DeleteObjectCommand,
	GetObjectCommand,
	GetObjectCommandInput,
	PutObjectCommand,
	PutObjectCommandInput,
	S3Client,
} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {Injectable} from '@nestjs/common';
import ms from 'ms';
import crypto from 'node:crypto';

import {ConfigurationService} from '@core/config/config.service';
import {File} from '@modules/file/file.entity';

@Injectable()
export class S3Service {
	private readonly BUCKET;
	private readonly URL_EXPIRATION;

	constructor(
		private config: ConfigurationService,
		private readonly s3: S3Client,
	) {
		this.BUCKET = this.config.get('S3_BUCKET');

		const expirationMs = ms(this.config.get('S3_URL_EXPIRATION'));
		const expirationSeconds = Math.floor(expirationMs / 1000);
		this.URL_EXPIRATION = expirationSeconds;
	}

	async uploadFile(file: Express.Multer.File) {
		const key = `${crypto.randomUUID()}-${file.originalname}`;

		const command: PutObjectCommandInput = {
			Bucket: this.BUCKET,
			Key: key,
			Body: file.buffer,
			ContentType: file.mimetype,
		};
		await this.s3.send(new PutObjectCommand(command));
		return key;
	}

	async getSignedUrl(file: File) {
		const command: GetObjectCommandInput = {
			Bucket: this.BUCKET,
			Key: file.key,
			ResponseContentDisposition: `attachment; filename=${file.name}`,
			ResponseContentType: file.mimeType,
		};
		return await getSignedUrl(this.s3, new GetObjectCommand(command), {expiresIn: this.URL_EXPIRATION});
	}

	async deleteFile(key: File['key']) {
		await this.s3.send(new DeleteObjectCommand({Bucket: this.BUCKET, Key: key}));
	}
}
