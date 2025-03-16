import {IsEnum, IsOptional} from 'class-validator';

import {Category} from '@core/transaction-categorizer/constants/category.enum';

export class TransactionUpdateDto {
  @IsOptional()
  @IsEnum(Category)
  category?: Category;
}
