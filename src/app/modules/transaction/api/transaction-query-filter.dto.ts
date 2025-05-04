import {Type} from 'class-transformer';
import {IsArray, IsDateString, IsEnum, IsOptional, ValidateNested} from 'class-validator';

import {Category} from '@modules/transaction/transaction-categorizer/constants/category.enum';

import {Bank} from '../transaction-mapper/constants/bank.enum';

export class DateRangeDto {
	@IsDateString()
	from: Date;

	@IsDateString()
	@IsOptional()
	to?: Date;
}

export class TransactionQueryFilterDto {
	@IsOptional()
	@IsArray()
	@IsEnum(Category, {each: true})
	categories?: Category[];

	@IsOptional()
	@ValidateNested()
	@Type(() => DateRangeDto)
	startedAt?: DateRangeDto;

	@IsOptional()
	@IsArray()
	@IsEnum(Bank, {each: true})
	banks?: Bank[];
}
