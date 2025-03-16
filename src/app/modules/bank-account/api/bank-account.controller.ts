import {Body, Controller, Get, Param, ParseUUIDPipe, Post} from '@nestjs/common';

import {CurrentUser} from '@core/auth/decorators/current-user.decorator';
import {User} from '@modules/user/user.entity';

import {BankAccount} from '../bank-account.entity';
import {BankAccountService} from '../bank-account.service';
import {BankAccountCreateDto} from './bank-account-create.dto';

@Controller('bank-accounts')
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Post()
  createBankAccount(@Body() dto: BankAccountCreateDto, @CurrentUser() user: User) {
    return this.bankAccountService.save(dto, user.id);
  }

  @Get()
  getAllBankAccounts(@CurrentUser() user: User) {
    return this.bankAccountService.findAllByUserId(user.id);
  }

  @Get(':id')
  getBankAccountById(
    @Param('id', new ParseUUIDPipe({version: '4'})) id: BankAccount['id'],
    @CurrentUser() user: User,
  ) {
    return this.bankAccountService.findById(id, user.id);
  }
}
