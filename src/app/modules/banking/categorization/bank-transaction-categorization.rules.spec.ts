import {applyBankTransactionCategorizationRule} from './bank-transaction-categorization.rules';

describe('applyBankTransactionCategorizationRule', () => {
	it.each([
		[{transactionType: 'TRANSFER', amount: '25.00', creditDebitIndicator: null}, 'TRANSFER_IN'],
		[{transactionType: 'TRANSFER', amount: '0.00', creditDebitIndicator: 'CRDT'}, 'TRANSFER_IN'],
		[{transactionType: 'TRANSFER', amount: '-25.00', creditDebitIndicator: null}, 'TRANSFER_OUT'],
		[{transactionType: 'TRANSFER', amount: '0.00', creditDebitIndicator: 'DBIT'}, 'TRANSFER_OUT'],
		[{transactionType: 'SALARY', amount: '100.00', creditDebitIndicator: 'CRDT'}, 'INCOME'],
		[{transactionType: 'INTEREST', amount: '1.00', creditDebitIndicator: 'CRDT'}, 'INCOME'],
		[{transactionType: 'REFUND', amount: '10.00', creditDebitIndicator: 'CRDT'}, 'REFUND'],
		[{transactionType: 'FEE', amount: '-2.00', creditDebitIndicator: 'DBIT'}, 'FEES'],
		[{transactionType: 'CASH_WITHDRAWAL', amount: '-20.00', creditDebitIndicator: 'DBIT'}, 'CASH_WITHDRAWAL'],
	] as const)('maps %j to %s with full confidence', (transaction, category) => {
		expect(applyBankTransactionCategorizationRule(transaction)).toEqual({category, confidence: 1});
	});

	it.each([
		['5411', 'FOOD_AND_DRINK'],
		['5541', 'TRANSPORTATION'],
		['4900', 'HOUSING_AND_UTILITIES'],
		['5311', 'SHOPPING'],
		['4814', 'SUBSCRIPTIONS'],
		['5912', 'HEALTH'],
		['7011', 'TRAVEL'],
		['7922', 'ENTERTAINMENT'],
		['7230', 'PERSONAL_CARE'],
		['8211', 'EDUCATION'],
		['6300', 'INSURANCE'],
	] as const)('maps MCC %s to %s with full confidence', (merchantCategoryCode, category) => {
		expect(
			applyBankTransactionCategorizationRule({
				transactionType: 'CARD_PAYMENT',
				merchantCategoryCode,
				amount: '-10.00',
				creditDebitIndicator: 'DBIT',
			}),
		).toEqual({category, confidence: 1});
	});

	it('keeps specific transaction rules ahead of merchant category mapping', () => {
		expect(
			applyBankTransactionCategorizationRule({
				transactionType: 'REFUND',
				merchantCategoryCode: '5411',
				amount: '10.00',
				creditDebitIndicator: 'CRDT',
			}),
		).toEqual({category: 'REFUND', confidence: 1});
	});

	it('does not map a credit transaction from its merchant category', () => {
		expect(
			applyBankTransactionCategorizationRule({
				transactionType: 'CARD_PAYMENT',
				merchantCategoryCode: '5411',
				amount: '10.00',
				creditDebitIndicator: 'CRDT',
			}),
		).toBeNull();
	});

	it('leaves an unknown MCC eligible for provider classification', () => {
		expect(
			applyBankTransactionCategorizationRule({
				transactionType: 'CARD_PAYMENT',
				merchantCategoryCode: '9999',
				amount: '-10.00',
				creditDebitIndicator: 'DBIT',
			}),
		).toBeNull();
	});

	it('does not classify a transfer when its direction is ambiguous', () => {
		expect(
			applyBankTransactionCategorizationRule({
				transactionType: 'TRANSFER',
				amount: '0.00',
				creditDebitIndicator: null,
			}),
		).toBeNull();
	});

	it.each(['CARD_PAYMENT', 'DIRECT_DEBIT', 'OTHER'])(
		'leaves %s eligible for provider classification',
		(transactionType) => {
			expect(
				applyBankTransactionCategorizationRule({
					transactionType,
					amount: '-10.00',
					creditDebitIndicator: 'DBIT',
				}),
			).toBeNull();
		},
	);
});
