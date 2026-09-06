import {BANK_TRANSACTION_TYPES, normalizeBankTransactionType} from './bank-transaction-type';

describe('normalizeBankTransactionType', () => {
	it.each([
		[
			'card classifications',
			{code: 'PMNT', subCode: 'CARD', description: 'Card payment'},
			BANK_TRANSACTION_TYPES.CARD_PAYMENT,
		],
		[
			'transfer classifications',
			{code: 'PMNT', subCode: 'TRANSFER', description: 'SEPA transfer'},
			BANK_TRANSACTION_TYPES.TRANSFER,
		],
		['direct debit classifications', {description: 'Direct debit'}, BANK_TRANSACTION_TYPES.DIRECT_DEBIT],
		[
			'cash withdrawal classifications',
			{description: 'ATM cash withdrawal'},
			BANK_TRANSACTION_TYPES.CASH_WITHDRAWAL,
		],
		['fee classifications', {description: 'Bank fee'}, BANK_TRANSACTION_TYPES.FEE],
		['interest classifications', {description: 'Interest payment'}, BANK_TRANSACTION_TYPES.INTEREST],
		['salary classifications', {description: 'Salary payment'}, BANK_TRANSACTION_TYPES.SALARY],
		['refund classifications', {description: 'Refund'}, BANK_TRANSACTION_TYPES.REFUND],
	])('%s', (_label, classification, expected) => {
		expect(normalizeBankTransactionType(classification)).toBe(expected);
	});

	it.each([
		['Coffee shop is not a fee', {description: 'Coffee shop'}, BANK_TRANSACTION_TYPES.OTHER],
		['Deposit is not a card payment', {description: 'Deposit'}, BANK_TRANSACTION_TYPES.OTHER],
		[
			'structured card code takes precedence over the description',
			{code: 'PMNT', subCode: 'CARD', description: 'Coffee shop'},
			BANK_TRANSACTION_TYPES.CARD_PAYMENT,
		],
		['fee descriptions', {description: 'Monthly account fee'}, BANK_TRANSACTION_TYPES.FEE],
		['card descriptions', {description: 'Card payment at a merchant'}, BANK_TRANSACTION_TYPES.CARD_PAYMENT],
		['deposit descriptions', {description: 'Bank deposit'}, BANK_TRANSACTION_TYPES.OTHER],
	])('%s', (_label, classification, expected) => {
		expect(normalizeBankTransactionType(classification)).toBe(expected);
	});

	it('uses OTHER when the provider classification is absent or unknown', () => {
		expect(normalizeBankTransactionType({})).toBe(BANK_TRANSACTION_TYPES.OTHER);
		expect(normalizeBankTransactionType({code: 'ZZZZ', subCode: 'UNKNOWN', description: 'Something else'})).toBe(
			BANK_TRANSACTION_TYPES.OTHER,
		);
	});
});
