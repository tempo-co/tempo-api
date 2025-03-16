import {Transform} from 'class-transformer';
import {IsIn, IsInt, Min} from 'class-validator';

export const DEFAULT_PAGE_INDEX = 0;
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

export class TransactionQueryPaginationDto {
  @Transform(({value}) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  pageIndex: number;

  @Transform(({value}) => parseInt(value, 10))
  @IsInt()
  @IsIn(PAGE_SIZE_OPTIONS)
  pageSize: number;
}
