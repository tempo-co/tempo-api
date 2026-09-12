import type {BankTransactionCategory} from './bank-transaction-category';

export type BankTransactionCategorizationRuleInput = {
	transactionType: string | null | undefined;
	amount: string;
	creditDebitIndicator: string | null | undefined;
};

export type BankTransactionCategorizationRuleResult = {
	category: BankTransactionCategory;
	confidence: 1;
};

export function applyBankTransactionCategorizationRule(
	transaction: BankTransactionCategorizationRuleInput,
): BankTransactionCategorizationRuleResult | null {
	const transactionType = transaction.transactionType?.trim().toUpperCase();
	const indicator = transaction.creditDebitIndicator?.trim().toUpperCase();

	if (transactionType === 'TRANSFER') {
		const amount = Number(transaction.amount.trim());
		if (Number.isFinite(amount) && amount > 0) return {category: 'TRANSFER_IN', confidence: 1};
		if (Number.isFinite(amount) && amount < 0) return {category: 'TRANSFER_OUT', confidence: 1};
		if (indicator === 'CRDT') return {category: 'TRANSFER_IN', confidence: 1};
		if (indicator === 'DBIT') return {category: 'TRANSFER_OUT', confidence: 1};
		return null;
	}

	switch (transactionType) {
		case 'SALARY':
		case 'INTEREST':
			return {category: 'INCOME', confidence: 1};
		case 'REFUND':
			return {category: 'REFUND', confidence: 1};
		case 'FEE':
			return {category: 'FEES', confidence: 1};
		case 'CASH_WITHDRAWAL':
			return {category: 'CASH_WITHDRAWAL', confidence: 1};
		default:
			return null;
	}
}

export const getBankTransactionCategorizationRule = applyBankTransactionCategorizationRule;
