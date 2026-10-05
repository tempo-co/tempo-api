import type {BankTransactionCategoryFilterValue} from '../../categorization/bank-transaction-category';
import type {BaselineDay, SpendingPaceDay} from '../../summary/bank-transaction-summary';

/** Money fields are decimal strings with two places in the owner's base currency. */
export class BankTransactionSummaryResponseDto {
	month: string;
	through: string;
	daysInMonth: number;
	/** Null until the owner's first conversion run has picked a base currency. */
	baseCurrency: string | null;
	totals: {spending: string; income: string; net: string; ownTransfers: string};
	/** Rows in the period left out of the totals. */
	excluded: {unknownDirection: number; missingBaseAmount: number};
	daily: SpendingPaceDay[];
	baseline: {
		months: string[];
		daily: BaselineDay[];
		spendingByThrough: string | null;
		incomeByThrough: string | null;
	};
	categories: BankTransactionSummaryCategoryDto[];
}

export class BankTransactionSummaryCategoryDto {
	category: BankTransactionCategoryFilterValue;
	spending: string;
	count: number;
	baselineAverage: string | null;
}

export class BankTransactionReviewCountsResponseDto {
	needsReview: number;
	categorizationFailed: number;
	categorizing: number;
	unknownDirection: number;
	missingBaseAmount: number;
}
