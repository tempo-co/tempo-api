import type {BankTransactionCategorizationSource} from '../../categorization/bank-transaction-categorization.types';
import type {BankTransactionCategory} from '../../categorization/bank-transaction-category';
import type {
	BankTransactionRuleDirection,
	BankTransactionRuleMatchField,
} from '../../rules/bank-transaction-rule.types';

export class BankTransactionRuleResponseDto {
	id: string;
	bankAccountId: string;
	bankAccountName: string | null;
	name: string;
	category: BankTransactionCategory;
	active: boolean;
	direction: BankTransactionRuleDirection;
	transactionType: string;
	currency: string;
	amount: string;
	matchField: BankTransactionRuleMatchField;
	matchText: string;
	createdAt: Date;
	updatedAt: Date;
}

export class BankTransactionRulePreviewTransactionDto {
	id: string;
	bookingDate: string | null;
	amount: string;
	currency: string;
	displayDescription: string;
	category: BankTransactionCategory | null;
	categorySource: BankTransactionCategorizationSource | null;
	isManual: boolean;
}

export class BankTransactionRulePreviewResponseDto {
	bankAccountId: string;
	direction: BankTransactionRuleDirection;
	transactionType: string;
	currency: string;
	amount: string;
	matchField: BankTransactionRuleMatchField;
	matchText: string;
	totalMatches: number;
	existingManualMatches: number;
	existingRuleMatches: number;
	existingEligibleMatches: number;
	conflictingRuleNames: string[];
	matches: BankTransactionRulePreviewTransactionDto[];
}

export class BankTransactionRuleMutationResponseDto {
	rule: BankTransactionRuleResponseDto;
	appliedToTransactionIds: string[];
}
