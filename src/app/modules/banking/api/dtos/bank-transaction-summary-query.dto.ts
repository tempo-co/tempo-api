import {IsDateString, Matches} from 'class-validator';

export class BankTransactionSummaryQueryDto {
	@Matches(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/)
	month: string;

	/** The client's local date; the current month is summarized through this day. */
	@IsDateString({strict: true})
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	asOf: string;
}
