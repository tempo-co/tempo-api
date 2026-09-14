import {Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {Account} from '@modules/account/account.entity';
import {CurrentAccount} from '@modules/auth/decorators/current-user.decorator';

import {BankTransactionService} from '../services/bank-transaction.service';
import {BankTransactionCategoryUpdateDto} from './dtos/bank-transaction-category-update.dto';
import {BankTransactionQueryDto} from './dtos/bank-transaction-query.dto';

@ApiTags('Bank transactions')
@Controller('bank-transactions')
export class BankTransactionController {
	constructor(private readonly bankTransactionService: BankTransactionService) {}

	@Get()
	findAll(@CurrentAccount() account: Account, @Query() query: BankTransactionQueryDto) {
		return this.bankTransactionService.findAll(account.id, query);
	}

	@Get(':id')
	findOne(@CurrentAccount() account: Account, @Param('id', new ParseUUIDPipe({version: '4'})) id: string) {
		return this.bankTransactionService.findById(account.id, id);
	}

	@Patch(':id/category')
	updateCategory(
		@CurrentAccount() account: Account,
		@Param('id', new ParseUUIDPipe({version: '4'})) id: string,
		@Body() dto: BankTransactionCategoryUpdateDto,
	) {
		return this.bankTransactionService.updateCategory(account.id, id, dto.category);
	}
}
