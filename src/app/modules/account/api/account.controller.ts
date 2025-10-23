import {Body, Controller, Get, Patch} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {CurrentAccount} from '@modules/auth/decorators/current-user.decorator';
import {SkipEmailVerification} from '@modules/auth/decorators/skip-email-verification.decorator';

import {Account} from '../account.entity';
import {AccountService} from '../account.service';
import {AccountUpdateDto} from './account-update.dto';

@ApiTags('Accounts')
@Controller('accounts')
export class AccountController {
	constructor(private readonly accountService: AccountService) {}

	@Get('me')
	@SkipEmailVerification()
	findOne(@CurrentAccount() account: Account) {
		return this.accountService.findById(account.id);
	}

	@Patch('me')
	update(@Body() updates: AccountUpdateDto, @CurrentAccount() account: Account) {
		return this.accountService.update(account.id, updates);
	}
}
