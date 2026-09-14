import type {BankTransactionCategory} from './bank-transaction-category';

export type BankTransactionCategorizationRuleInput = {
	transactionType: string | null | undefined;
	amount: string;
	creditDebitIndicator: string | null | undefined;
	merchantCategoryCode?: string | null | undefined;
};

export type BankTransactionCategorizationRuleResult = {
	category: BankTransactionCategory;
	confidence: 1;
};

const MERCHANT_CATEGORY_CODE_CATEGORIES: Readonly<Record<string, BankTransactionCategory>> = {
	'4111': 'TRANSPORTATION',
	'4112': 'TRANSPORTATION',
	'4121': 'TRANSPORTATION',
	'4131': 'TRANSPORTATION',
	'5411': 'FOOD_AND_DRINK',
	'5422': 'FOOD_AND_DRINK',
	'5451': 'FOOD_AND_DRINK',
	'5462': 'FOOD_AND_DRINK',
	'5499': 'FOOD_AND_DRINK',
	'5811': 'FOOD_AND_DRINK',
	'5812': 'FOOD_AND_DRINK',
	'5813': 'FOOD_AND_DRINK',
	'5814': 'FOOD_AND_DRINK',
	'4511': 'TRAVEL',
	'4722': 'TRAVEL',
	'7011': 'TRAVEL',
	'7012': 'TRAVEL',
	'4814': 'SUBSCRIPTIONS',
	'4816': 'SUBSCRIPTIONS',
	'4899': 'SUBSCRIPTIONS',
	'4900': 'HOUSING_AND_UTILITIES',
	'5311': 'SHOPPING',
	'5331': 'SHOPPING',
	'5399': 'SHOPPING',
	'5611': 'SHOPPING',
	'5621': 'SHOPPING',
	'5631': 'SHOPPING',
	'5641': 'SHOPPING',
	'5651': 'SHOPPING',
	'5661': 'SHOPPING',
	'5691': 'SHOPPING',
	'5699': 'SHOPPING',
	'5732': 'SHOPPING',
	'5734': 'SHOPPING',
	'5941': 'SHOPPING',
	'5942': 'SHOPPING',
	'5943': 'SHOPPING',
	'5944': 'SHOPPING',
	'5945': 'SHOPPING',
	'5946': 'SHOPPING',
	'5947': 'SHOPPING',
	'5948': 'SHOPPING',
	'5949': 'SHOPPING',
	'5999': 'SHOPPING',
	'5541': 'TRANSPORTATION',
	'5542': 'TRANSPORTATION',
	'7523': 'TRANSPORTATION',
	'7512': 'TRANSPORTATION',
	'7538': 'TRANSPORTATION',
	'7542': 'TRANSPORTATION',
	'5912': 'HEALTH',
	'8011': 'HEALTH',
	'8021': 'HEALTH',
	'8031': 'HEALTH',
	'8041': 'HEALTH',
	'8042': 'HEALTH',
	'8043': 'HEALTH',
	'8044': 'HEALTH',
	'8049': 'HEALTH',
	'8050': 'HEALTH',
	'8062': 'HEALTH',
	'8071': 'HEALTH',
	'8099': 'HEALTH',
	'6300': 'INSURANCE',
	'6381': 'INSURANCE',
	'6399': 'INSURANCE',
	'7230': 'PERSONAL_CARE',
	'7298': 'PERSONAL_CARE',
	'7299': 'PERSONAL_CARE',
	'8211': 'EDUCATION',
	'8220': 'EDUCATION',
	'8241': 'EDUCATION',
	'8244': 'EDUCATION',
	'8249': 'EDUCATION',
	'8299': 'EDUCATION',
	'6011': 'CASH_WITHDRAWAL',
	'7832': 'ENTERTAINMENT',
	'7911': 'ENTERTAINMENT',
	'7922': 'ENTERTAINMENT',
	'7929': 'ENTERTAINMENT',
	'7932': 'ENTERTAINMENT',
	'7933': 'ENTERTAINMENT',
	'7941': 'ENTERTAINMENT',
	'7991': 'ENTERTAINMENT',
	'7993': 'ENTERTAINMENT',
	'7994': 'ENTERTAINMENT',
	'7996': 'ENTERTAINMENT',
	'7997': 'ENTERTAINMENT',
	'7998': 'ENTERTAINMENT',
	'7999': 'ENTERTAINMENT',
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
			break;
	}

	const merchantCategory = MERCHANT_CATEGORY_CODE_CATEGORIES[transaction.merchantCategoryCode?.trim() ?? ''];
	const amount = Number(transaction.amount.trim());
	const isDebit = indicator === 'DBIT' || (!indicator && Number.isFinite(amount) && amount < 0);
	return merchantCategory && isDebit ? {category: merchantCategory, confidence: 1} : null;
}

export const getBankTransactionCategorizationRule = applyBankTransactionCategorizationRule;
