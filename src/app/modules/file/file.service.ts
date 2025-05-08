import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Response} from 'express';
import {Repository} from 'typeorm';

import {S3Service} from '@core/s3/s3.service';
import {Account} from '@modules/account/account.entity';
import {MimeType} from '@modules/file/file-parser/constants/mime-type.enum';

import {File} from './file.entity';

@Injectable()
export class FileService {
	constructor(
		@InjectRepository(File)
		private readonly fileRepository: Repository<File>,
		private readonly s3Service: S3Service,
	) {}

	async save(file: Express.Multer.File): Promise<File> {
		const key = await this.s3Service.uploadFile(file);

		const fileEntity = this.fileRepository.create({
			name: file.originalname,
			size: file.size,
			mimeType: file.mimetype as MimeType,
			key: key,
		});
		return this.fileRepository.save(fileEntity);
	}

	async findOneByIdAndAccountId(fileId: File['id'], accountId: Account['id']) {
		const file = await this.fileRepository.findOne({
			where: {id: fileId, bankStatement: {bankAccount: {account: {id: accountId}}}},
			relations: ['bankStatement', 'bankStatement.bankAccount', 'bankStatement.bankAccount.account'],
		});

		if (!file) {
			throw new NotFoundException('File not found.');
		}
		return file;
	}

	async getSignedUrl(file: File) {
		return this.s3Service.getSignedUrl(file);
	}

	async deleteById(id: File['id']) {
		const meta = await this.fileRepository.findOneBy({id});
		if (!meta) {
			throw new NotFoundException('File not found.');
		}

		await this.s3Service.deleteFile(meta.key);
		await this.fileRepository.delete(id);
	}

	async setFileHeaders(res: Response, file: File) {
		res.set({
			'Content-Type': file.mimeType,
			'Content-Length': file.size.toString(),
			'X-File-Id': file.id,
			'Content-Disposition': `attachment; filename="${file.name}"`,
			'Access-Control-Expose-Headers': 'Content-Disposition, X-File-Id',
		});
	}
}
