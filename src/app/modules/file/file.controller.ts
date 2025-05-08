import {Controller, Get, Head, Param, ParseUUIDPipe, Res} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';
import {Response} from 'express';

import {Account} from '@modules/account/account.entity';
import {CurrentUser} from '@modules/auth/decorators/current-user.decorator';

import {File} from './file.entity';
import {FileService} from './file.service';

@ApiTags('Files')
@Controller('files')
export class FileController {
	constructor(private readonly fileService: FileService) {}

	@Head(':id')
	async findOneMetadata(
		@CurrentUser() user: Account,
		@Param('id', new ParseUUIDPipe({version: '4'})) id: File['id'],
		@Res({passthrough: true}) res: Response,
	) {
		const file = await this.fileService.findOneByIdAndAccountId(id, user.id);
		this.fileService.setFileHeaders(res, file);
	}

	@Get(':id')
	async findOneUrl(@CurrentUser() user: Account, @Param('id', new ParseUUIDPipe({version: '4'})) id: File['id']) {
		const file = await this.fileService.findOneByIdAndAccountId(id, user.id);
		const url = await this.fileService.getSignedUrl(file);
		return {url};
	}
}
