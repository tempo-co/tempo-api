import {IsEnum} from 'class-validator';

import {BANK_TRANSACTION_CATEGORIES, BankTransactionCategory} from '../../categorization/bank-transaction-category';

export class BankTransactionCategoryUpdateDto {
	@IsEnum(BANK_TRANSACTION_CATEGORIES)
	category: BankTransactionCategory;
}
