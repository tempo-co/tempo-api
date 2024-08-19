import {Body, Controller, Get, Param, ParseUUIDPipe, Post} from '@nestjs/common';

import {CurrentUser} from '@core/auth/decorators/current-user.decorator';
import {User} from '@modules/user/user.entity';

import {Account} from '../account.entity';
import {AccountService} from '../services/account.service';
import {AccountCreateDto} from './account-create.dto';

@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  createAccount(@Body() dto: AccountCreateDto, @CurrentUser() user: User): Promise<Account> {
    return this.accountService.save(dto, user.id);
  }

  @Get()
  getAllAccounts(@CurrentUser() user: User): Promise<Account[]> {
    return this.accountService.findAllByUserId(user.id);
  }

  @Get(':id')
  getAccountById(
    @Param('id', new ParseUUIDPipe({version: '4'})) accountId: Account['id'],
    @CurrentUser() user: User,
  ): Promise<Account> {
    return this.accountService.findById(accountId, user.id);
  }
}
