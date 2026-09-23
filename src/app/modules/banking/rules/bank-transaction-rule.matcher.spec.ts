import {describe, expect, it} from '@jest/globals';

import {
	type BankTransactionRuleMatchInput,
	matchesBankTransactionRule,
	selectMatchingBankTransactionRule,
} from './bank-transaction-rule.matcher';

type Rule = Parameters<typeof matchesBankTransactionRule>[0];

const transaction: BankTransactionRuleMatchInput = {
	bankAccountId: 'account-1',
	creditDebitIndicator: 'DBIT',
	transactionType: 'TRANSFER',
	currency: 'EUR',
	amount: '-693.5000',
	bankTransactionDescription: 'SEPA transfer to Roommate Example',
	remittanceInformation: null,
};

const rule: Rule = {
	bankAccountId: 'account-1',
	direction: 'EXPENSE',
	transactionType: 'TRANSFER',
	currency: 'eur',
	amount: '693.50',
	matchField: 'BANK_TRANSACTION_DESCRIPTION',
	matchText: 'roommate example',
	active: true,
};

const mismatches: Array<[string, Partial<BankTransactionRuleMatchInput>]> = [
	['a different account', {bankAccountId: 'account-2'}],
	['an incoming transaction', {creditDebitIndicator: 'CRDT'}],
	['a different transaction type', {transactionType: 'CARD'}],
	['a different currency', {currency: 'GBP'}],
	['a different absolute amount', {amount: '-693.51'}],
	['a different raw description', {bankTransactionDescription: 'SEPA transfer to someone else'}],
];

describe('bank transaction rule matcher', () => {
	it('matches the stable account, transfer, amount, currency, direction, and raw description fields', () => {
		expect(matchesBankTransactionRule(rule, transaction)).toBe(true);
	});

	it.each(mismatches)('rejects %s', (_label: string, change: Partial<BankTransactionRuleMatchInput>) => {
		expect(matchesBankTransactionRule(rule, {...transaction, ...change})).toBe(false);
	});

	it('treats a missing transaction type as OTHER consistently with rule creation', () => {
		expect(
			matchesBankTransactionRule({...rule, transactionType: 'OTHER'}, {...transaction, transactionType: null}),
		).toBe(true);
	});

	it('matches remittance information when that is the selected raw field', () => {
		expect(
			matchesBankTransactionRule(
				{...rule, matchField: 'REMITTANCE_INFORMATION', matchText: 'rent share'},
				{...transaction, bankTransactionDescription: null, remittanceInformation: 'Rent share for September'},
			),
		).toBe(true);
	});

	it('does not substitute the normalized description when the selected raw field is missing', () => {
		const transactionWithOnlyNormalizedDescription = {
			...transaction,
			bankTransactionDescription: null,
			description: 'SEPA transfer to Roommate Example',
		};

		expect(matchesBankTransactionRule(rule, transactionWithOnlyNormalizedDescription)).toBe(false);
	});

	it('fails closed when multiple active rules match different categories', () => {
		const matchingRules = [
			{...rule, id: 'rule-1', category: 'HOUSING_AND_UTILITIES'},
			{...rule, id: 'rule-2', category: 'OTHER'},
		];

		expect(selectMatchingBankTransactionRule(matchingRules, transaction)).toBeNull();
	});

	it('ignores inactive rules and returns the matching active rule', () => {
		const activeRule = {...rule, id: 'rule-2', category: 'HOUSING_AND_UTILITIES'};
		const result = selectMatchingBankTransactionRule(
			[{...rule, id: 'rule-1', active: false}, activeRule],
			transaction,
		);

		expect(result).toMatchObject({id: 'rule-2'});
	});
});
