import {Controller, Get, Param, ParseUUIDPipe} from '@nestjs/common';

import {TransactionService} from '../services/transaction.service';
import {Transaction} from '../transaction.entity';

@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({version: '4'})) id: Transaction['id'],
  ): Promise<Transaction> {
    return this.transactionService.findById(id);
  }
}
