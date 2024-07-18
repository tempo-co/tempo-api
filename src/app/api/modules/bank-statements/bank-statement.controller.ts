import {
  Controller,
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

@Controller('bank-statements')
export class BankStatementController {
  constructor(private readonly bankStatementService: BankStatementService) {}

  @Post('upload/:accountId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBankStatement(
    @Param('accountId', new ParseUUIDPipe({version: '4'})) accountId: Account['id'],
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ): Promise<BankStatement> {
    return this.bankStatementService.process({file, accountId, userId: user.id});
  }
}
