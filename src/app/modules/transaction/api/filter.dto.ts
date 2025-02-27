import {IsArray, IsDate, IsEnum, IsOptional, ValidateNested} from 'class-validator';

import {Category} from '@core/transaction-categorizer/constants/category.enum';

import {Transaction} from '../transaction.entity';

export class DateRangeDto {
  @IsDate()
  from: Date;

  @IsDate()
  @IsOptional()
  to?: Date;
}

export class FilterDto {
  @IsOptional()
  @IsArray()
  @IsEnum(Category, {each: true})
  categories?: Transaction['category'][];

  @IsOptional()
  @ValidateNested()
  startedAt?: DateRangeDto;
}
