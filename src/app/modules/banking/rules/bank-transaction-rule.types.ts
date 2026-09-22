import type {BankTransactionCategory} from '../categorization/bank-transaction-category';

export const BANK_TRANSACTION_RULE_MATCH_FIELDS = ['BANK_TRANSACTION_DESCRIPTION', 'REMITTANCE_INFORMATION'] as const;
export type BankTransactionRuleMatchField = (typeof BANK_TRANSACTION_RULE_MATCH_FIELDS)[number];

export type BankTransactionRuleDirection = 'INCOME' | 'EXPENSE';

export type BankTransactionRuleCondition = {
	bankAccountId: string;
	direction: BankTransactionRuleDirection;
	transactionType: string;
	currency: string;
	amount: string;
	matchField: BankTransactionRuleMatchField;
	matchText: string;
};

export type BankTransactionRuleCategory = BankTransactionCategory;
