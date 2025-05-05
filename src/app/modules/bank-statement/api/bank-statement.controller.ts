import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Res,
	StreamableFile,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ApiResponse, ApiTags} from '@nestjs/swagger';
import {Response} from 'express';

import {Account} from '@modules/account/account.entity';
import {UNAUTHORIZED} from '@modules/auth/api/constants/api-messages.constants';
import {CurrentUser} from '@modules/auth/decorators/current-user.decorator';
import {BankAccount} from '@modules/bank-account/bank-account.entity';
import {PaginationDto} from '@modules/bank-statement/api/pagination.dto';

import {BankStatement} from '../bank-statement.entity';
import {BankStatementService} from '../bank-statement.service';

@ApiTags('Bank statements')
// TODO: REMOVE :bankAccountId FROM PATH
@Controller('bank-accounts/:bankAccountId/bank-statements')
export class BankStatementController {
	constructor(private readonly bankStatementService: BankStatementService) {}

	@Post('upload')
	@UseInterceptors(FileInterceptor('file'))
	@Post('login')
	@HttpCode(200)
	@ApiResponse({status: 200, description: 'Bank statement created.'})
	@ApiResponse({status: 400, description: 'Failed to parse file.'})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 409, description: 'A bank statement already exists for this period.'})
	@ApiResponse({status: 422, description: 'File is not a valid bank statement.'})
	async upload(
		@CurrentUser() user: Account,
		@UploadedFile() file: Express.Multer.File,
		@Param('bankAccountId', new ParseUUIDPipe({version: '4'})) bankAccountId: BankAccount['id'],
	): Promise<BankStatement> {
		return this.bankStatementService.save(file, bankAccountId, user.id);
	}

	@Get()
	async getAllByAccountAndBankAccountId(
		@CurrentUser() user: Account,
		@Param('bankAccountId', new ParseUUIDPipe({version: '4'})) bankAccountId: BankAccount['id'],
		@Query() paginationDto: PaginationDto,
	): Promise<{
		bankStatements: BankStatement[];
		total: number;
	}> {
		return this.bankStatementService.findAllByBankAccountIdAndAccountId(bankAccountId, user.id, paginationDto);
	}

	@Delete(':bankStatementId')
	async deleteById(
		@CurrentUser() user: Account,
		@Param('bankStatementId', new ParseUUIDPipe({version: '4'}))
		bankStatementId: BankStatement['id'],
	): Promise<void> {
		return this.bankStatementService.deleteByIdAndAccountId(bankStatementId, user.id);
	}

	@Get(':bankStatementId/file')
	async getFile(
		@CurrentUser() user: Account,
		@Param('bankStatementId', new ParseUUIDPipe({version: '4'}))
		bankStatementId: BankStatement['id'],
		@Res({passthrough: true}) res: Response,
	): Promise<StreamableFile> {
		const file = await this.bankStatementService.findFileByIdAndAccountId(bankStatementId, user.id);

		res.set({
			'Content-Type': file.type,
			'Access-Control-Expose-Headers': 'Content-Disposition',
			'Content-Disposition': `attachment; filename="${file.name}"`,
			'Content-Length': file.size.toString(),
			'X-File-Id': file.id,
		});
		return new StreamableFile(file.buffer);
	}
}
