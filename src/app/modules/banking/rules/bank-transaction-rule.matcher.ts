import {toBankTransactionDirection} from '../bank-transaction-direction';
import {BANK_TRANSACTION_TYPES} from '../bank-transaction-type';
import type {BankTransactionRuleCondition, BankTransactionRuleMatchField} from './bank-transaction-rule.types';

export type {BankTransactionRuleMatchField} from './bank-transaction-rule.types';

export type BankTransactionRuleMatchInput = {
	bankAccountId: string;
	creditDebitIndicator: string | null;
	transactionType: string | null;
	currency: string;
	amount: string;
	bankTransactionDescription: string | null;
	remittanceInformation: string | null;
};

export type BankTransactionRuleMatcher = BankTransactionRuleCondition & {
	id?: string;
	active: boolean;
	category?: string;
};

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeAbsoluteAmount(value: string | number): string | null {
	const normalized = String(value).trim().replace(/^\+/, '').replace(/^-/, '');
	if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
	const [integerPart, fractionPart = ''] = normalized.split('.');
	const trimmedIntegerPart = integerPart.replace(/^0+(?=\d)/, '') || '0';
	const trimmedFractionPart = fractionPart.replace(/0+$/, '');
	return trimmedFractionPart.length > 0 ? `${trimmedIntegerPart}.${trimmedFractionPart}` : trimmedIntegerPart;
}

function rawMatchValue(
	transaction: BankTransactionRuleMatchInput,
	field: BankTransactionRuleMatchField,
): string | null {
	if (field === 'REMITTANCE_INFORMATION') return transaction.remittanceInformation;
	return transaction.bankTransactionDescription;
}

export function matchesBankTransactionRule(
	rule: Pick<
		BankTransactionRuleMatcher,
		| 'bankAccountId'
		| 'direction'
		| 'transactionType'
		| 'currency'
		| 'amount'
		| 'matchField'
		| 'matchText'
		| 'active'
	>,
	transaction: BankTransactionRuleMatchInput,
): boolean {
	if (!rule.active || rule.bankAccountId !== transaction.bankAccountId) return false;
	if (rule.direction !== toBankTransactionDirection(transaction.creditDebitIndicator)) return false;
	if (
		rule.transactionType.toUpperCase() !==
		(transaction.transactionType ?? BANK_TRANSACTION_TYPES.OTHER).toUpperCase()
	)
		return false;
	if (rule.currency.toUpperCase() !== transaction.currency.toUpperCase()) return false;
	if (normalizeAbsoluteAmount(rule.amount) !== normalizeAbsoluteAmount(transaction.amount)) return false;

	const matchText = normalizeText(rule.matchText);
	const rawText = normalizeText(rawMatchValue(transaction, rule.matchField));
	return matchText.length > 0 && rawText.includes(matchText);
}

export function selectMatchingBankTransactionRule<Rule extends BankTransactionRuleMatcher>(
	rules: readonly Rule[],
	transaction: BankTransactionRuleMatchInput,
): Rule | null {
	const matches = rules.filter((rule) => matchesBankTransactionRule(rule, transaction));
	if (matches.length === 0) return null;
	const categories = new Set(
		matches.map((rule) => rule.category).filter((category): category is string => category != null),
	);
	if (categories.size > 1) return null;
	return matches[0];
}
