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
