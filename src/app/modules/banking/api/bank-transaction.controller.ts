import {Controller, Get, Param, ParseUUIDPipe, Query} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {Account} from '@modules/account/account.entity';
import {CurrentAccount} from '@modules/auth/decorators/current-user.decorator';

import {BankTransactionService} from '../services/bank-transaction.service';
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
}
