import {Type} from 'class-transformer';
import {IsOptional, ValidateNested} from 'class-validator';

import {TransactionQueryFilterDto} from './transaction-query-filter.dto';
import {TransactionQueryPaginationDto} from './transaction-query-pagination.dto';
import {TransactionQuerySortDto} from './transaction-query-sort.dto';

export class TransactionQueryDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TransactionQueryPaginationDto)
  pagination?: TransactionQueryPaginationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransactionQuerySortDto)
  sort?: TransactionQuerySortDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransactionQueryFilterDto)
  filter?: TransactionQueryFilterDto;
}
