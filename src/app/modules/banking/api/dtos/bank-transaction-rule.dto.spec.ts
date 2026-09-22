import {validateSync} from 'class-validator';

import {BankTransactionRuleCreateDto, BankTransactionRuleUpdateDto} from './bank-transaction-rule.dto';

const validRuleDraft = {
	sourceTransactionId: '00000000-0000-4000-8000-000000000001',
	name: 'Synthetic rule',
	category: 'OTHER',
	matchField: 'BANK_TRANSACTION_DESCRIPTION',
	matchText: 'Synthetic description',
} as const;

describe('BankTransactionRuleDto', () => {
	it('rejects whitespace-only create names', () => {
		const dto = Object.assign(new BankTransactionRuleCreateDto(), {...validRuleDraft, name: ' \t '});

		expect(validateSync(dto).map(({property}) => property)).toContain('name');
	});

	it('rejects whitespace-only create match text', () => {
		const dto = Object.assign(new BankTransactionRuleCreateDto(), {...validRuleDraft, matchText: ' \t '});

		expect(validateSync(dto).map(({property}) => property)).toContain('matchText');
	});

	it('rejects whitespace-only update names', () => {
		const dto = Object.assign(new BankTransactionRuleUpdateDto(), {name: ' \t '});

		expect(validateSync(dto).map(({property}) => property)).toContain('name');
	});

	it('rejects whitespace-only update match text', () => {
		const dto = Object.assign(new BankTransactionRuleUpdateDto(), {matchText: ' \t '});

		expect(validateSync(dto).map(({property}) => property)).toContain('matchText');
	});
});
