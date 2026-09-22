import {Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {Account} from '@modules/account/account.entity';
import {CurrentAccount} from '@modules/auth/decorators/current-user.decorator';

import {
	BankTransactionRuleCreateDto,
	BankTransactionRuleDraftDto,
	BankTransactionRuleUpdateDto,
} from '../api/dtos/bank-transaction-rule.dto';
import {BankTransactionRuleService} from './bank-transaction-rule.service';

@ApiTags('Bank transaction rules')
@Controller('bank-transaction-rules')
export class BankTransactionRuleController {
	constructor(private readonly ruleService: BankTransactionRuleService) {}

	@Get()
	findAll(@CurrentAccount() account: Account) {
		return this.ruleService.findAll(account.id);
	}

	@Post('preview')
	preview(@CurrentAccount() account: Account, @Body() dto: BankTransactionRuleDraftDto) {
		return this.ruleService.preview(account.id, dto);
	}

	@Post()
	create(@CurrentAccount() account: Account, @Body() dto: BankTransactionRuleCreateDto) {
		return this.ruleService.create(account.id, dto);
	}

	@Patch(':id')
	update(
		@CurrentAccount() account: Account,
		@Param('id', new ParseUUIDPipe({version: '4'})) id: string,
		@Body() dto: BankTransactionRuleUpdateDto,
	) {
		return this.ruleService.update(account.id, id, dto);
	}

	@Delete(':id')
	deactivate(@CurrentAccount() account: Account, @Param('id', new ParseUUIDPipe({version: '4'})) id: string) {
		return this.ruleService.deactivate(account.id, id);
	}
}
