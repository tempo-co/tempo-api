import {Controller, Get, Param, ParseUUIDPipe} from '@nestjs/common';

import {Transaction} from '@entities/transaction/transaction.entity';

import {TransactionService} from './transaction.service';

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
