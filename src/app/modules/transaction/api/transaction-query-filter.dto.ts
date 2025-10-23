import {Type} from 'class-transformer';
import {IsArray, IsDateString, IsEnum, IsOptional, IsUUID, ValidateNested} from 'class-validator';

import {Category} from '@modules/transaction/transaction-categorizer/constants/category.enum';

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
	@IsUUID('4', {each: true})
	bankAccountIds?: string[];
}
