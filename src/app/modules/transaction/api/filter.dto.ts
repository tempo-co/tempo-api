import {IsArray, IsEnum, IsOptional} from 'class-validator';

import {Category} from '@core/transaction-categorizer/constants/category.enum';

import {Transaction} from '../transaction.entity';

export class FilterDto {
  @IsOptional()
  @IsArray()
  @IsEnum(Category, {each: true})
  categories?: Transaction['category'][];
}
