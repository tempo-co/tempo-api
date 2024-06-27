import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';

import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';

import {BankStatementService} from './bank-statement.service';

@Controller('bank-statement')
export class BankStatementController {
  constructor(private readonly bankStatementService: BankStatementService) {}

  @Post('upload/:accountId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBankStatement(
    @Param('accountId', new ParseUUIDPipe({version: '4'})) accountId: Account['id'],
    @UploadedFile() file: Express.Multer.File,
  ): Promise<BankStatement> {
    return this.bankStatementService.process(file, accountId);
  }
}
