import {
	IsBoolean,
	IsEnum,
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
	MinLength,
} from 'class-validator';

import {BANK_TRANSACTION_DIRECTIONS} from '../../bank-transaction-direction';
import {BANK_TRANSACTION_TYPES} from '../../bank-transaction-type';
import {
	BANK_TRANSACTION_CATEGORIES,
	type BankTransactionCategory,
} from '../../categorization/bank-transaction-category';
import {
	BANK_TRANSACTION_RULE_MATCH_FIELDS,
	type BankTransactionRuleMatchField,
} from '../../rules/bank-transaction-rule.types';

export class BankTransactionRuleDraftDto {
	@IsUUID('4')
	sourceTransactionId: string;

	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, {message: 'name must contain a non-whitespace character'})
	@MinLength(1)
	@MaxLength(120)
	name: string;

	@IsEnum(BANK_TRANSACTION_CATEGORIES)
	category: BankTransactionCategory;

	@IsIn(BANK_TRANSACTION_RULE_MATCH_FIELDS)
	matchField: BankTransactionRuleMatchField;

	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, {message: 'matchText must contain a non-whitespace character'})
	@MinLength(1)
	@MaxLength(160)
	matchText: string;
}

export class BankTransactionRuleCreateDto extends BankTransactionRuleDraftDto {
	@IsOptional()
	@IsBoolean()
	applyToExisting = false;
}

export class BankTransactionRuleUpdateDto {
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, {message: 'name must contain a non-whitespace character'})
	@MaxLength(120)
	name?: string;

	@IsOptional()
	@IsEnum(BANK_TRANSACTION_CATEGORIES)
	category?: BankTransactionCategory;

	@IsOptional()
	@IsIn(BANK_TRANSACTION_RULE_MATCH_FIELDS)
	matchField?: BankTransactionRuleMatchField;

	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, {message: 'matchText must contain a non-whitespace character'})
	@MaxLength(160)
	matchText?: string;

	@IsOptional()
	@IsBoolean()
	active?: boolean;
}

export const BANK_TRANSACTION_RULE_DIRECTIONS = [
	BANK_TRANSACTION_DIRECTIONS.INCOME,
	BANK_TRANSACTION_DIRECTIONS.EXPENSE,
] as const;

export const BANK_TRANSACTION_RULE_TRANSACTION_TYPES = Object.values(BANK_TRANSACTION_TYPES);
