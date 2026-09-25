export enum BankCashFlowGranularityResponse {
	WEEK = 'WEEK',
	MONTH = 'MONTH',
	YEAR = 'YEAR',
}

export class BankCashFlowBucketResponseDto {
	startDate: string;
	endDate: string;
	income: string;
	expenses: string;
	net: string;
	transactionCount: number;
	includedTransactionCount: number;
	internalCount: number;
	unknownCount: number;
}

export class BankCashFlowTotalsResponseDto {
	income: string;
	expenses: string;
	net: string;
	transactionCount: number;
	includedTransactionCount: number;
	internalCount: number;
	unknownCount: number;
}

export class BankCashFlowSeriesResponseDto {
	currency: string;
	buckets: BankCashFlowBucketResponseDto[];
	totals: BankCashFlowTotalsResponseDto;
}

export class BankCashFlowResponseDto {
	granularity: BankCashFlowGranularityResponse;
	from: string;
	to: string;
	series: BankCashFlowSeriesResponseDto[];
	dataQuality: {
		missingBookingDateCount: number;
	};
}
