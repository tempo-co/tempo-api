import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ApiOperation, ApiResponse, ApiTags} from '@nestjs/swagger';

import {Account} from '@modules/account/account.entity';
import {UNAUTHORIZED} from '@modules/auth/api/constants/api-messages.constants';
import {CurrentAccount} from '@modules/auth/decorators/current-user.decorator';
import {BankAccount} from '@modules/bank-account/bank-account.entity';
import {PaginationDto} from '@modules/bank-statement/api/dtos/pagination.dto';

import {BankStatement} from '../bank-statement.entity';
import {BankStatementService} from '../bank-statement.service';
import {
	BANK_STATEMENT_DELETE_SUCCESS,
	BANK_STATEMENT_NOT_FOUND,
	BANK_STATEMENT_UPLOAD_ACCEPTED,
	JOB_NOT_FOUND,
} from './constants/api-messages.constants';
import {JobStatusDto} from './dtos/job-status.dto';

@ApiTags('Bank statements')
@Controller('bank-accounts/:bankAccountId/bank-statements')
export class BankStatementController {
	constructor(private readonly bankStatementService: BankStatementService) {}

	@Post('upload')
	@HttpCode(202)
	@UseInterceptors(FileInterceptor('file'))
	@ApiResponse({status: 202, description: BANK_STATEMENT_UPLOAD_ACCEPTED})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiOperation({summary: 'Accepts a bank statement file for processing.'})
	async upload(
		@CurrentAccount() account: Account,
		@UploadedFile() file: Express.Multer.File,
		@Param('bankAccountId', new ParseUUIDPipe({version: '4'})) bankAccountId: BankAccount['id'],
	) {
		return this.bankStatementService.addUploadJob(account.id, file, bankAccountId);
	}

	@Get('upload/status/:jobId')
	@ApiResponse({status: 200, type: JobStatusDto})
	@ApiResponse({status: 404, description: JOB_NOT_FOUND})
	@ApiOperation({summary: 'Get the status of a bank statement upload job.'})
	async getUploadStatus(@Param('jobId') jobId: string, @CurrentAccount() account: Account) {
		return this.bankStatementService.getJobStatus(jobId, account.id);
	}

	@Get()
	@ApiResponse({status: 200})
	@ApiOperation({summary: 'Get all bank statements for a bank account.'})
	async getAll(
		@CurrentAccount() account: Account,
		@Param('bankAccountId', new ParseUUIDPipe({version: '4'})) bankAccountId: BankAccount['id'],
		@Query() paginationDto: PaginationDto,
	) {
		return this.bankStatementService.findAll(bankAccountId, account.id, paginationDto);
	}

	@Delete(':bankStatementId')
	@HttpCode(204)
	@ApiResponse({status: 204, description: BANK_STATEMENT_DELETE_SUCCESS})
	@ApiResponse({status: 404, description: BANK_STATEMENT_NOT_FOUND})
	@ApiOperation({summary: 'Delete a bank statement by ID.'})
	async delete(
		@CurrentAccount() account: Account,
		@Param('bankStatementId', new ParseUUIDPipe({version: '4'}))
		bankStatementId: BankStatement['id'],
	) {
		return this.bankStatementService.delete(bankStatementId, account.id);
	}
}
