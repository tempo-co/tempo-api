import {Transform, Type} from 'class-transformer';
import {
	IsArray,
	IsDateString,
	IsEnum,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';

import {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS} from '@core/pagination/pagination.constants';
import {transformStrictDecimalInteger} from '@core/pagination/pagination.transform';

export const DEFAULT_BANK_TRANSACTION_PAGE_INDEX = DEFAULT_PAGE_INDEX;
export const DEFAULT_BANK_TRANSACTION_PAGE_SIZE = DEFAULT_PAGE_SIZE;
export const BANK_TRANSACTION_PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS;
export const MAX_BANK_TRANSACTION_PAGE_SIZE = Math.max(...BANK_TRANSACTION_PAGE_SIZE_OPTIONS);

export enum BankTransactionSortField {
	BOOKING_DATE = 'bookingDate',
	AMOUNT = 'amount',
}

export enum BankTransactionSortOrder {
	ASC = 'ASC',
	DESC = 'DESC',
}

export class BankTransactionPaginationQueryDto {
	@IsOptional()
	@Transform(transformStrictDecimalInteger)
	@IsInt()
	@Min(0)
	pageIndex: number = DEFAULT_BANK_TRANSACTION_PAGE_INDEX;

	@IsOptional()
	@Transform(transformStrictDecimalInteger)
	@IsInt()
	@Min(1)
	@IsIn(BANK_TRANSACTION_PAGE_SIZE_OPTIONS)
	pageSize: number = DEFAULT_BANK_TRANSACTION_PAGE_SIZE;
}

export class BankTransactionSortQueryDto {
	@IsEnum(BankTransactionSortField)
	by: BankTransactionSortField;

	@IsEnum(BankTransactionSortOrder)
	order: BankTransactionSortOrder;
}

export class BankTransactionBookingDateFilterDto {
	@IsOptional()
	@IsDateString({strict: true})
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	from?: string;

	@IsOptional()
	@IsDateString({strict: true})
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	to?: string;
}

export class BankTransactionFilterQueryDto {
	@IsOptional()
	@ValidateNested()
	@Type(() => BankTransactionBookingDateFilterDto)
	bookingDate?: BankTransactionBookingDateFilterDto;

	@IsOptional()
	@IsArray()
	@IsUUID('4', {each: true})
	bankAccountIds?: string[];

	@IsOptional()
	@IsString()
	@MaxLength(100)
	search?: string;
}

export class BankTransactionQueryDto {
	@IsOptional()
	@ValidateNested()
	@Type(() => BankTransactionPaginationQueryDto)
	pagination?: BankTransactionPaginationQueryDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => BankTransactionSortQueryDto)
	sort?: BankTransactionSortQueryDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => BankTransactionFilterQueryDto)
	filter?: BankTransactionFilterQueryDto;
}
