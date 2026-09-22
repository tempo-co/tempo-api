import {ConflictException} from '@nestjs/common';

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
		const ruleApplied = createTransaction({id: 'rule-id', categorySource: 'RULE', category: 'SHOPPING'});
		const currencyExchange = createTransaction({
			id: 'exchange-id',
			categoryStatus: 'NOT_APPLICABLE',
			financialEventType: 'CURRENCY_EXCHANGE',
		});
		const transactionQuery = createQueryBuilder(source);
		const ruleRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder([])),
			find: jest.fn().mockResolvedValue([]),
		};
		const transactionRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(transactionQuery),
			find: jest.fn().mockResolvedValue([source, aiTransaction, ruleApplied, currencyExchange]),
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
			totalMatches: 3,
			existingManualMatches: 1,
			existingRuleMatches: 1,
			existingEligibleMatches: 1,
			matchField: 'BANK_TRANSACTION_DESCRIPTION',
		});
		expect(result.matches.map(({id}) => id)).toEqual(['source-id', 'ai-id', 'rule-id']);
	});

	it('rejects currency-exchange transactions as rule sources', async () => {
		const source = createTransaction({
			id: 'exchange-source-id',
			categoryStatus: 'NOT_APPLICABLE',
			financialEventType: 'CURRENCY_EXCHANGE',
		});
		const ruleRepository = {find: jest.fn().mockResolvedValue([])};
		const transactionRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder(source)),
			find: jest.fn().mockResolvedValue([source]),
		};
		const service = new BankTransactionRuleService(
			ruleRepository as never,
			transactionRepository as never,
			{} as never,
		);

		await expect(
			service.preview('account-owner-id', {
				sourceTransactionId: source.id,
				name: 'Synthetic exchange rule',
				category: 'HOUSING_AND_UTILITIES',
				matchField: 'BANK_TRANSACTION_DESCRIPTION',
				matchText: 'synthetic roommate',
			}),
		).rejects.toThrow('Currency-exchange transactions cannot be used as rule sources.');
	});

	it('flags contains rules that can match the same text without containing each other', async () => {
		const source = createTransaction({
			id: 'source-id',
			bankTransactionDescription: 'abcx',
		});
		const existingRule = createRule({name: 'Synthetic abc rule', category: 'OTHER', matchText: 'abc'});
		const ruleRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder([])),
			find: jest.fn().mockResolvedValue([existingRule]),
		};
		const transactionRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder(source)),
			find: jest.fn().mockResolvedValue([source]),
		};
		const service = new BankTransactionRuleService(
			ruleRepository as never,
			transactionRepository as never,
			{} as never,
		);

		const result = await service.preview('account-owner-id', {
			sourceTransactionId: source.id,
			name: 'Synthetic bcx rule',
			category: 'HOUSING_AND_UTILITIES',
			matchField: 'BANK_TRANSACTION_DESCRIPTION',
			matchText: 'bcx',
		});

		expect(result.conflictingRuleNames).toEqual(['Synthetic abc rule']);
	});

	it('flags potential conflicts across different raw match fields', async () => {
		const source = createTransaction({id: 'source-id'});
		const existingRule = createRule({
			name: 'Synthetic description rule',
			category: 'OTHER',
			matchText: 'synthetic roommate',
		});
		const ruleRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder([])),
			find: jest.fn().mockResolvedValue([existingRule]),
		};
		const transactionRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder(source)),
			find: jest.fn().mockResolvedValue([source]),
		};
		const service = new BankTransactionRuleService(
			ruleRepository as never,
			transactionRepository as never,
			{} as never,
		);

		const result = await service.preview('account-owner-id', {
			sourceTransactionId: source.id,
			name: 'Synthetic remittance rule',
			category: 'HOUSING_AND_UTILITIES',
			matchField: 'REMITTANCE_INFORMATION',
			matchText: 'september rent share',
		});

		expect(result.conflictingRuleNames).toEqual(['Synthetic description rule']);
	});

	it('rejects duplicate rule names when creating a rule', async () => {
		const source = createTransaction({id: 'source-id'});
		const duplicate = createRule({id: 'existing-rule-id', name: 'Synthetic shared name'});
		const bankAccountRepository = {
			findOne: jest.fn().mockResolvedValue({id: 'account-id', name: 'Synthetic test account'}),
		};
		const managerRuleRepository = {
			findOne: jest.fn().mockResolvedValue(duplicate),
			find: jest.fn().mockResolvedValue([]),
			create: jest.fn(),
			save: jest.fn().mockResolvedValue(createRule()),
		};
		const manager = {
			getRepository: jest
				.fn()
				.mockReturnValueOnce(bankAccountRepository)
				.mockReturnValueOnce(managerRuleRepository),
		};
		const dataSource = {
			transaction: jest.fn((callback: (value: unknown) => unknown) => callback(manager)),
		};
		const ruleRepository = {find: jest.fn().mockResolvedValue([])};
		const transactionRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder(source)),
			find: jest.fn().mockResolvedValue([source]),
		};
		const service = new BankTransactionRuleService(
			ruleRepository as never,
			transactionRepository as never,
			dataSource as never,
		);

		await expect(
			service.create('account-owner-id', {
				sourceTransactionId: source.id,
				name: duplicate.name,
				category: 'HOUSING_AND_UTILITIES',
				matchField: 'BANK_TRANSACTION_DESCRIPTION',
				matchText: 'synthetic roommate',
				applyToExisting: false,
			}),
		).rejects.toThrow(ConflictException);
		expect(managerRuleRepository.save).not.toHaveBeenCalled();
	});

	it('rejects duplicate rule names when renaming a rule', async () => {
		const currentRule = createRule({id: 'current-rule-id', name: 'Synthetic current name'});
		const duplicate = createRule({id: 'existing-rule-id', name: 'Synthetic shared name'});
		const bankAccountRepository = {
			findOne: jest.fn().mockResolvedValue({id: 'account-id', name: 'Synthetic test account'}),
		};
		const managerRuleRepository = {
			findOne: jest.fn().mockResolvedValueOnce(currentRule).mockResolvedValueOnce(duplicate),
			find: jest.fn().mockResolvedValue([]),
			save: jest.fn().mockResolvedValue(currentRule),
		};
		const manager = {
			getRepository: jest
				.fn()
				.mockReturnValueOnce(bankAccountRepository)
				.mockReturnValueOnce(managerRuleRepository),
		};
		const dataSource = {
			transaction: jest.fn((callback: (value: unknown) => unknown) => callback(manager)),
		};
		const ruleRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder(currentRule)),
		};
		const service = new BankTransactionRuleService(ruleRepository as never, {} as never, dataSource as never);

		await expect(service.update('account-owner-id', currentRule.id, {name: duplicate.name})).rejects.toThrow(
			ConflictException,
		);
		expect(managerRuleRepository.save).not.toHaveBeenCalled();
	});

	it('does not apply categorization rules to currency-exchange rows', async () => {
		const exchange = createTransaction({
			id: 'currency-exchange-id',
			categoryStatus: 'NOT_APPLICABLE',
			financialEventType: 'CURRENCY_EXCHANGE',
		});
		const updateQueryBuilder = createQueryBuilder(null);
		const transactionRepository = {
			find: jest.fn().mockResolvedValue([exchange]),
			createQueryBuilder: jest.fn().mockReturnValue(updateQueryBuilder),
		};
		const ruleRepository = {find: jest.fn().mockResolvedValue([createRule()])};
		const service = new BankTransactionRuleService(
			ruleRepository as never,
			transactionRepository as never,
			{} as never,
		);

		const applied = await service.applyRulesToTransactions([exchange.id]);

		expect(applied).toEqual([]);
		expect(updateQueryBuilder.update).not.toHaveBeenCalled();
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
		expect(updateQueryBuilder.andWhere).toHaveBeenCalledWith(
			'"financialEventType" IS DISTINCT FROM :currencyExchangeType',
			{currencyExchangeType: 'CURRENCY_EXCHANGE'},
		);
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
