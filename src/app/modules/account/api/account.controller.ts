import {Body, Controller, Get, Patch} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {CurrentUser} from '@modules/auth/decorators/current-user.decorator';
import {SkipEmailVerification} from '@modules/auth/decorators/skip-email-verification.decorator';

import {Account} from '../account.entity';
import {AccountService} from '../account.service';
import {AccountUpdateDto} from './account-update.dto';

type IdealUserContext = {
	account: {accountId: Account['id']}; // just {id: Account['id']} -> no reason to store all the account info
};

@ApiTags('Accounts')
@Controller('accounts')
export class AccountController {
	constructor(private readonly accountService: AccountService) {}

	@Get('me')
	@SkipEmailVerification()
	findOne(@CurrentUser() user: Account) {
		return this.accountService.findById(user.id);
	}

	// Type of the user parameter should become User
	@Patch('me')
	update(@Body() {name: fullName}: AccountUpdateDto, @CurrentUser() user: Account) {
		// Users should not have an ID, this const is a replacement for something like user.account.id
		// TODO: A user class should be implemented
		const idealUserContext: IdealUserContext = {account: {accountId: user.id}}; // this will be temporary until a solution is implemented
		const {accountId} = idealUserContext.account; // this will become user.account once implemented
		return this.accountService.update(accountId, {name: fullName});
	}
}
