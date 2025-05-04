import {IsEnum} from 'class-validator';

export enum SortField {
	STARTED_AT = 'startedAt',
	AMOUNT = 'amount',
}

export enum SortOrder {
	ASC = 'ASC',
	DESC = 'DESC',
}

export class TransactionQuerySortDto {
	@IsEnum(SortField)
	by: SortField;

	@IsEnum(SortOrder)
	order: SortOrder;
}
