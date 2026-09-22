import {BankTransaction} from '../bank-transaction.entity';
import {BankTransactionRule} from './bank-transaction-rule.entity';
import {BankTransactionRuleService} from './bank-transaction-rule.service';

function createTransaction(overrides: Partial<BankTransaction> = {}): BankTransaction {
	return {
		id: 'transaction-id',
		bankAccountId: 'account-id',
		providerTransactionId: 'provider-id',
		entryReference: 'entry-reference',
		dedupeKey: 'dedupe-key',
		bookingDate: '2026-09-01',
		valueDate: '2026-09-01',
		transactionDate: '2026-09-01',
		amount: '-693.50',
		amountInBaseCurrency: null,
		currency: 'EUR',
		creditDebitIndicator: 'DBIT',
		transactionType: 'TRANSFER',
		transactionStatus: 'BOOK',
		bankTransactionCode: 'PMNT',
		bankTransactionSubCode: 'TRF',
		bankTransactionDescription: 'Transfer to Synthetic Roommate',
		description: 'Transfer to Synthetic Roommate',
		displayDescription: 'Transfer to Synthetic Roommate',
		counterpartyName: null,
		merchantLocation: null,
		merchantCategoryCode: null,
		remittanceInformation: 'September rent share',
		category: null,
		categoryStatus: 'PENDING',
		categorySource: null,
		categoryRuleId: null,
		categoryConfidence: null,
		categoryInputHash: null,
		categoryAppliedInputHash: null,
		categoryProvider: null,
		categoryModel: null,
		categoryPromptVersion: null,
		categoryUpdatedAt: null,
		categoryLastError: null,
		categorySearchTrace: null,
		financialEventType: null,
		financialEventSource: null,
		financialEventRuleVersion: null,
		balanceAfterAmount: null,
		balanceAfterCurrency: null,
		instructedAmount: null,
		instructedCurrency: null,
		exchangeRate: null,
		exchangeRateUnitCurrency: null,
		exchangeRateType: null,
		referenceNumber: null,
		referenceNumberScheme: null,
		createdAt: new Date('2026-09-01T00:00:00.000Z'),
		updatedAt: new Date('2026-09-01T00:00:00.000Z'),
		...overrides,
	} as BankTransaction;
}

function createRule(overrides: Partial<BankTransactionRule> = {}): BankTransactionRule {
	return {
		id: 'rule-id',
		bankAccountId: 'account-id',
		name: 'Synthetic rent share',
		category: 'HOUSING_AND_UTILITIES',
		active: true,
		direction: 'EXPENSE',
		transactionType: 'TRANSFER',
		currency: 'EUR',
		amount: '693.50',
		matchField: 'BANK_TRANSACTION_DESCRIPTION',
		matchText: 'synthetic roommate',
		createdAt: new Date('2026-09-01T00:00:00.000Z'),
		updatedAt: new Date('2026-09-01T00:00:00.000Z'),
		...overrides,
	} as BankTransactionRule;
}

function createQueryBuilder(result: unknown) {
	return {
		innerJoinAndSelect: jest.fn().mockReturnThis(),
		innerJoin: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		orderBy: jest.fn().mockReturnThis(),
		getOne: jest.fn().mockResolvedValue(result),
		getMany: jest.fn().mockResolvedValue(result),
		update: jest.fn().mockReturnThis(),
		set: jest.fn().mockReturnThis(),
		execute: jest.fn().mockResolvedValue({affected: 1}),
	};
}

describe('BankTransactionRuleService', () => {
	it('previews raw-field matches and separates manual rows from eligible rows', async () => {
		const source = createTransaction({
			id: 'source-id',
			categorySource: 'MANUAL',
			category: 'HOUSING_AND_UTILITIES',
		});
		const aiTransaction = createTransaction({id: 'ai-id', categorySource: 'AI', category: 'OTHER'});
		const transactionQuery = createQueryBuilder(source);
		const ruleRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder([])),
			find: jest.fn().mockResolvedValue([]),
		};
		const transactionRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(transactionQuery),
			find: jest.fn().mockResolvedValue([source, aiTransaction]),
		};
		const service = new BankTransactionRuleService(
			ruleRepository as never,
			transactionRepository as never,
			{} as never,
		);

		const result = await service.preview('account-owner-id', {
			sourceTransactionId: source.id,
			name: 'Synthetic rent share',
			category: 'HOUSING_AND_UTILITIES',
			matchField: 'BANK_TRANSACTION_DESCRIPTION',
			matchText: 'synthetic roommate',
		});

		expect(result).toMatchObject({
			totalMatches: 2,
			existingManualMatches: 1,
			existingEligibleMatches: 1,
			matchField: 'BANK_TRANSACTION_DESCRIPTION',
		});
		expect(result.matches.map(({id}) => id)).toEqual(['source-id', 'ai-id']);
	});

	it('does not overwrite manual rows while applying a matching rule to AI rows', async () => {
		const manual = createTransaction({id: 'manual-id', categorySource: 'MANUAL', category: 'OTHER'});
		const ai = createTransaction({id: 'ai-id', categorySource: 'AI', category: 'OTHER'});
		const updateQueryBuilder = createQueryBuilder(null);
		const transactionRepository = {
			find: jest.fn().mockResolvedValue([manual, ai]),
			createQueryBuilder: jest.fn().mockReturnValue(updateQueryBuilder),
		};
		const ruleRepository = {find: jest.fn().mockResolvedValue([createRule()])};
		const service = new BankTransactionRuleService(
			ruleRepository as never,
			transactionRepository as never,
			{} as never,
		);

		const applied = await service.applyRulesToTransactions([manual.id, ai.id]);

		expect(applied).toEqual(['ai-id']);
		expect(updateQueryBuilder.update).toHaveBeenCalledTimes(1);
		expect(updateQueryBuilder.set).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'HOUSING_AND_UTILITIES',
				categorySource: 'RULE',
				categoryRuleId: 'rule-id',
				categoryStatus: 'COMPLETED',
			}),
		);
		expect(manual.categorySource).toBe('MANUAL');
	});
});
