import {
  Controller,
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
    @Param('accountId', new ParseUUIDPipe({version: '4'})) accountId: Account['id'],
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ): Promise<BankStatement> {
    return this.bankStatementService.save({file, accountId, userId: user.id});
  }

  @Get()
  async getAllByAccountIdAndUserId(
    @Param('accountId', new ParseUUIDPipe({version: '4'})) accountId: Account['id'],
    @CurrentUser() user: User,
  ): Promise<BankStatement[]> {
    return this.bankStatementService.findAllByUserIdAndAccountId(user.id, accountId);
  }
}
