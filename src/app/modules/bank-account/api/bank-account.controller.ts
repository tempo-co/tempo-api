import {Body, Controller, Get, Param, ParseUUIDPipe, Post} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {Account} from '@modules/account/account.entity';
import {CurrentAccount} from '@modules/auth/decorators/current-user.decorator';

import {BankAccount} from '../bank-account.entity';
import {BankAccountService} from '../bank-account.service';
import {BankAccountCreateDto} from './bank-account-create.dto';

@ApiTags('Bank accounts')
@Controller('bank-accounts')
export class BankAccountController {
	constructor(private readonly bankAccountService: BankAccountService) {}

	@Post()
	createBankAccount(@Body() dto: BankAccountCreateDto, @CurrentAccount() account: Account) {
		return this.bankAccountService.save(dto, account.id);
	}

	@Get()
	getAllBankAccounts(@CurrentAccount() account: Account) {
		return this.bankAccountService.findAllByAccountId(account.id);
	}

	@Get(':id')
	getBankAccountById(
		@Param('id', new ParseUUIDPipe({version: '4'})) id: BankAccount['id'],
		@CurrentAccount() account: Account,
	) {
		return this.bankAccountService.findById(id, account.id);
	}
}
