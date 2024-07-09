import {Body, Controller, Get, Post} from '@nestjs/common';

import {CurrentUser} from '@core/auth/decorators/current-user.decorator';
import {Account} from '@entities/account/account.entity';
import {User} from '@entities/user/user.entity';

import {AccountCreateDto} from './account-create.dto';
import {AccountService} from './account.service';

@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  createAccount(@Body() dto: AccountCreateDto, @CurrentUser() user: User): Promise<Account> {
    const {alias, bank} = dto;
    return this.accountService.save({alias, bank, userId: user.id});
  }

  @Get('me')
  getCurrentUserAccounts(@CurrentUser() user: User): Promise<Account[]> {
    return this.accountService.findAllByUserId(user.id);
  }
}
