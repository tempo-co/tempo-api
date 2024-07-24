import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';

import {CurrentUser} from '@core/auth/decorators/current-user.decorator';
import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';
import {User} from '@entities/user/user.entity';

import {BankStatementService} from './bank-statement.service';

@Controller('accounts/:accountId/bank-statements')
export class BankStatementController {
  constructor(private readonly bankStatementService: BankStatementService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Param('accountId', new ParseUUIDPipe({version: '4'})) accountId: Account['id'],
  ): Promise<BankStatement> {
    return this.bankStatementService.save({file, accountId, userId: user.id});
  }

  @Get()
  async getAllByAccountIdAndUserId(
    @CurrentUser() user: User,
    @Param('accountId', new ParseUUIDPipe({version: '4'})) accountId: Account['id'],
  ): Promise<BankStatement[]> {
    return this.bankStatementService.findAllByAccountIdAndUserId(accountId, user.id);
  }

  @Delete(':bankStatementId')
  async deleteById(
    @CurrentUser() user: User,
    @Param('bankStatementId', new ParseUUIDPipe({version: '4'}))
    bankStatementId: BankStatement['id'],
  ): Promise<void> {
    return this.bankStatementService.deleteByIdAndUserId(bankStatementId, user.id);
  }
}
