import {Controller, Get, Param, ParseUUIDPipe, Query} from '@nestjs/common';

import {CurrentUser} from '@core/auth/decorators/current-user.decorator';
import {User} from '@modules/user/user.entity';

import {Transaction} from '../transaction.entity';
import {TransactionService} from '../transaction.service';
import {FilterDto} from './filter.dto';
import {PaginationDto} from './pagination.dto';

@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({version: '4'})) id: Transaction['id']) {
    return this.transactionService.findById(id);
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query() paginationDto: PaginationDto,
    @Query() filterDto: FilterDto,
  ) {
    return this.transactionService.findAllByUserId(user.id, paginationDto, filterDto);
  }
}
