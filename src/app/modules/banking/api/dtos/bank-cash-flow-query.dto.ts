import {IsDateString, IsEnum, Matches} from 'class-validator';

export enum BankCashFlowGranularityQuery {
	WEEK = 'week',
	MONTH = 'month',
	YEAR = 'year',
}

export const BANK_CASH_FLOW_MAX_BUCKETS: Record<BankCashFlowGranularityQuery, number> = {
	[BankCashFlowGranularityQuery.WEEK]: 12,
	[BankCashFlowGranularityQuery.MONTH]: 6,
	[BankCashFlowGranularityQuery.YEAR]: 3,
};

export class BankCashFlowQueryDto {
	@IsEnum(BankCashFlowGranularityQuery)
	granularity: BankCashFlowGranularityQuery = BankCashFlowGranularityQuery.MONTH;

	@IsDateString({strict: true})
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	from: string;

	@IsDateString({strict: true})
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	to: string;
}
