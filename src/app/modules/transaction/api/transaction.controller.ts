import {Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {Account} from '@modules/account/account.entity';
import {CurrentUser} from '@modules/auth/decorators/current-user.decorator';

import {Transaction} from '../transaction.entity';
import {TransactionService} from '../transaction.service';
import {TransactionQueryDto} from './transaction-query.dto';
import {TransactionUpdateDto} from './transaction-update.dto';

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionController {
	constructor(private readonly transactionService: TransactionService) {}

	@Get()
	findAll(@CurrentUser() user: Account, @Query() queryParams: TransactionQueryDto) {
		return this.transactionService.findAllByAccountId(user.id, queryParams);
	}

	@Get(':id')
	findOne(@CurrentUser() user: Account, @Param('id', new ParseUUIDPipe({version: '4'})) id: Transaction['id']) {
		return this.transactionService.findById(user.id, id);
	}

	@Patch(':id')
	update(
		@CurrentUser() user: Account,
		@Param('id', new ParseUUIDPipe({version: '4'})) id: Transaction['id'],
		@Body() dto: TransactionUpdateDto,
	) {
		return this.transactionService.update(user.id, id, dto);
	}
}
