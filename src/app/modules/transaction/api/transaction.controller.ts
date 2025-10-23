import {Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {Account} from '@modules/account/account.entity';
import {CurrentAccount} from '@modules/auth/decorators/current-user.decorator';

import {Transaction} from '../transaction.entity';
import {TransactionService} from '../transaction.service';
import {TransactionQueryDto} from './transaction-query.dto';
import {TransactionUpdateDto} from './transaction-update.dto';

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionController {
	constructor(private readonly transactionService: TransactionService) {}

	@Get()
	findAll(@CurrentAccount() account: Account, @Query() queryParams: TransactionQueryDto) {
		return this.transactionService.findAllByAccountId(account.id, queryParams);
	}

	@Get(':id')
	findOne(@CurrentAccount() account: Account, @Param('id', new ParseUUIDPipe({version: '4'})) id: Transaction['id']) {
		return this.transactionService.findById(account.id, id);
	}

	@Patch(':id')
	update(
		@CurrentAccount() account: Account,
		@Param('id', new ParseUUIDPipe({version: '4'})) id: Transaction['id'],
		@Body() updates: TransactionUpdateDto,
	) {
		return this.transactionService.update(account.id, id, updates);
	}
}
