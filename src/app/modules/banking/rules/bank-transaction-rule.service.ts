import {BadRequestException, ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DataSource, EntityManager, In, Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {BANKING_TRANSACTION_NOT_FOUND} from '../api/constants/banking-messages.constants';
import {
	BankTransactionRuleMutationResponseDto,
	BankTransactionRulePreviewResponseDto,
	BankTransactionRulePreviewTransactionDto,
	BankTransactionRuleResponseDto,
} from '../api/dtos/bank-transaction-rule-response.dto';
import {
	BankTransactionRuleCreateDto,
	BankTransactionRuleDraftDto,
	BankTransactionRuleUpdateDto,
} from '../api/dtos/bank-transaction-rule.dto';
import {BankAccount} from '../bank-account.entity';
import {toBankTransactionDirection} from '../bank-transaction-direction';
import {BANK_TRANSACTION_FINANCIAL_EVENT_TYPES} from '../bank-transaction-financial-event';
import {BANK_TRANSACTION_TYPES} from '../bank-transaction-type';
import {BankTransaction} from '../bank-transaction.entity';
import {createBankTransactionCategorizationInputHash} from '../categorization/bank-transaction-categorization-input';
import {BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES} from '../categorization/bank-transaction-categorization.constants';
import {BankTransactionRule} from './bank-transaction-rule.entity';
import {
	type BankTransactionRuleMatchInput,
	type BankTransactionRuleMatcher,
	matchesBankTransactionRule,
	normalizeAbsoluteAmount,
	selectMatchingBankTransactionRule,
} from './bank-transaction-rule.matcher';
import type {BankTransactionRuleCondition} from './bank-transaction-rule.types';

const PREVIEW_SAMPLE_SIZE = 25;

type InternalRulePreview = {
	source: BankTransaction;
	condition: BankTransactionRuleCondition;
	matchingTransactions: BankTransaction[];
	conflictingRuleNames: string[];
};

@Injectable()
export class BankTransactionRuleService {
	constructor(
		@InjectRepository(BankTransactionRule)
		private readonly ruleRepository: Repository<BankTransactionRule>,
		@InjectRepository(BankTransaction)
		private readonly transactionRepository: Repository<BankTransaction>,
		private readonly dataSource: DataSource,
	) {}

	async findAll(accountId: Account['id']): Promise<BankTransactionRuleResponseDto[]> {
		const rules = await this.createOwnedRuleQuery(accountId).orderBy('rule.createdAt', 'ASC').getMany();
		return rules.map((rule) => this.toRuleResponse(rule));
	}

	async preview(
		accountId: Account['id'],
		dto: BankTransactionRuleDraftDto,
	): Promise<BankTransactionRulePreviewResponseDto> {
		const preview = await this.buildPreview(accountId, dto);
		return this.toPreviewResponse(preview);
	}

	async create(
		accountId: Account['id'],
		dto: BankTransactionRuleCreateDto,
	): Promise<BankTransactionRuleMutationResponseDto> {
		const preview = await this.buildPreview(accountId, dto);
		if (preview.conflictingRuleNames.length > 0) {
			throw new ConflictException(
				`This condition conflicts with active rules: ${preview.conflictingRuleNames.join(', ')}.`,
			);
		}

		return this.dataSource.transaction(async (manager) => {
			const bankAccount = await this.lockBankAccount(manager, preview.condition.bankAccountId);
			const ruleRepository = manager.getRepository(BankTransactionRule);
			await this.ensureUniqueRuleName(ruleRepository, preview.condition.bankAccountId, dto.name.trim());
			const activeRules = await ruleRepository.find({
				where: {bankAccountId: preview.condition.bankAccountId, active: true},
			});
			const conflictingRuleNames = this.findConflictingRuleNames(activeRules, {
				...preview.condition,
				active: true,
				category: dto.category,
			});
			if (conflictingRuleNames.length > 0) {
				throw new ConflictException(
					`This condition conflicts with active rules: ${conflictingRuleNames.join(', ')}.`,
				);
			}
			const rule = await ruleRepository.save(
				ruleRepository.create({
					...preview.condition,
					bankAccount,
					name: dto.name.trim(),
					category: dto.category,
					active: true,
				}),
			);
			const appliedToTransactionIds = dto.applyToExisting
				? await this.applyRulesToTransactions(
						preview.matchingTransactions.map(({id}) => id),
						manager,
					)
				: [];

			return {
				rule: this.toRuleResponse(rule),
				appliedToTransactionIds,
			};
		});
	}

	async update(
		accountId: Account['id'],
		id: BankTransactionRule['id'],
		dto: BankTransactionRuleUpdateDto,
	): Promise<BankTransactionRuleResponseDto> {
		const ownedRule = await this.findOwnedRule(accountId, id);
		return this.dataSource.transaction(async (manager) => {
			const bankAccount = await this.lockBankAccount(manager, ownedRule.bankAccountId);
			const ruleRepository = manager.getRepository(BankTransactionRule);
			const rule = await ruleRepository.findOne({where: {id}, relations: {bankAccount: true}});
			if (!rule) throw new NotFoundException('Bank transaction rule not found.');

			const nextValues = {
				name: dto.name?.trim() ?? rule.name,
				category: dto.category ?? rule.category,
				matchField: dto.matchField ?? rule.matchField,
				matchText: dto.matchText?.trim() ?? rule.matchText,
				active: dto.active ?? rule.active,
			};
			if (!nextValues.name || !nextValues.matchText) {
				throw new BadRequestException('Rule name and match text are required.');
			}
			await this.ensureUniqueRuleName(ruleRepository, rule.bankAccountId, nextValues.name, rule.id);

			const activeRules = await ruleRepository.find({
				where: {bankAccountId: rule.bankAccountId, active: true},
			});
			const conflictingRuleNames = this.findConflictingRuleNames(
				activeRules,
				{...this.toMatcher(rule), ...nextValues},
				rule.id,
			);
			if (conflictingRuleNames.length > 0 && nextValues.active) {
				throw new ConflictException(
					`This condition conflicts with active rules: ${conflictingRuleNames.join(', ')}.`,
				);
			}

			Object.assign(rule, nextValues, {bankAccount});
			return this.toRuleResponse(await ruleRepository.save(rule));
		});
	}

	async deactivate(accountId: Account['id'], id: BankTransactionRule['id']): Promise<BankTransactionRuleResponseDto> {
		return this.update(accountId, id, {active: false});
	}

	async applyRulesToTransactions(transactionIds: readonly string[], manager?: EntityManager): Promise<string[]> {
		const uniqueIds = [...new Set(transactionIds.filter((id) => id.length > 0))];
		if (uniqueIds.length === 0) return [];

		const transactionRepository = manager?.getRepository(BankTransaction) ?? this.transactionRepository;
		const ruleRepository = manager?.getRepository(BankTransactionRule) ?? this.ruleRepository;
		const transactions = await transactionRepository.find({where: {id: In(uniqueIds)}});
		if (transactions.length === 0) return [];
		const bankAccountIds = [...new Set(transactions.map(({bankAccountId}) => bankAccountId))];
		const rules = await ruleRepository.find({where: {bankAccountId: In(bankAccountIds), active: true}});
		const appliedIds: string[] = [];

		for (const transaction of transactions) {
			if (
				transaction.financialEventType === BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE ||
				transaction.categorySource === 'MANUAL' ||
				transaction.categorySource === 'RULE'
			) {
				continue;
			}
			const matchingRule = selectMatchingBankTransactionRule(
				rules.map((rule) => this.toMatcher(rule)),
				this.toMatchInput(transaction),
			);
			if (!matchingRule?.id) continue;

			const inputHash = createBankTransactionCategorizationInputHash(transaction);
			const result = await transactionRepository
				.createQueryBuilder()
				.update(BankTransaction)
				.set({
					...BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES,
					category: matchingRule.category ?? null,
					categoryStatus: 'COMPLETED',
					categorySource: 'RULE',
					categoryRuleId: matchingRule.id,
					categoryInputHash: inputHash,
					categoryAppliedInputHash: inputHash,
					categoryUpdatedAt: new Date(),
				})
				.where('id = :id', {id: transaction.id})
				.andWhere('"financialEventType" IS DISTINCT FROM :currencyExchangeType', {
					currencyExchangeType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
				})
				.andWhere('"categorySource" IS DISTINCT FROM \'MANUAL\'')
				.andWhere('"categorySource" IS DISTINCT FROM \'RULE\'')
				.execute();
			if ((result.affected ?? 0) > 0) appliedIds.push(transaction.id);
		}

		return appliedIds;
	}

	private async buildPreview(
		accountId: Account['id'],
		dto: BankTransactionRuleDraftDto,
	): Promise<InternalRulePreview> {
		const source = await this.findOwnedTransaction(accountId, dto.sourceTransactionId);
		if (source.financialEventType === BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE) {
			throw new BadRequestException('Currency-exchange transactions cannot be used as rule sources.');
		}
		const condition = this.toCondition(source, dto);
		const draft: BankTransactionRuleMatcher = {
			...condition,
			active: true,
			category: dto.category,
		};
		if (!matchesBankTransactionRule(draft, this.toMatchInput(source))) {
			throw new BadRequestException('The rule condition must match the source transaction.');
		}

		const [transactions, activeRules] = await Promise.all([
			this.transactionRepository.find({
				where: {bankAccountId: source.bankAccountId},
				select: {
					id: true,
					bankAccountId: true,
					bookingDate: true,
					valueDate: true,
					amount: true,
					currency: true,
					creditDebitIndicator: true,
					transactionType: true,
					bankTransactionDescription: true,
					remittanceInformation: true,
					financialEventType: true,
					category: true,
					categorySource: true,
					displayDescription: true,
				},
				order: {bookingDate: 'DESC', valueDate: 'DESC', id: 'DESC'},
			}),
			this.ruleRepository.find({where: {bankAccountId: source.bankAccountId, active: true}}),
		]);
		const matchingTransactions = transactions.filter(
			(transaction) =>
				transaction.financialEventType !== BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE &&
				matchesBankTransactionRule(draft, this.toMatchInput(transaction)),
		);
		const conflictingRuleNames = this.findConflictingRuleNames(activeRules, draft);

		return {source, condition, matchingTransactions, conflictingRuleNames};
	}

	private toCondition(source: BankTransaction, dto: BankTransactionRuleDraftDto): BankTransactionRuleCondition {
		const direction = toBankTransactionDirection(source.creditDebitIndicator);
		if (direction === 'UNKNOWN') {
			throw new BadRequestException('The source transaction has no supported direction.');
		}
		const amount = normalizeAbsoluteAmount(source.amount);
		if (!amount) throw new BadRequestException('The source transaction has an invalid amount.');

		return {
			bankAccountId: source.bankAccountId,
			direction,
			transactionType: source.transactionType ?? BANK_TRANSACTION_TYPES.OTHER,
			currency: source.currency.toUpperCase(),
			amount,
			matchField: dto.matchField,
			matchText: dto.matchText.trim(),
		};
	}

	private rulesOverlap(left: BankTransactionRuleMatcher, right: BankTransactionRuleMatcher): boolean {
		// Literal "contains" filters can coexist in one transaction, even with different text or fields.
		return (
			left.bankAccountId === right.bankAccountId &&
			left.direction === right.direction &&
			left.transactionType.toUpperCase() === right.transactionType.toUpperCase() &&
			left.currency.toUpperCase() === right.currency.toUpperCase() &&
			normalizeAbsoluteAmount(left.amount) === normalizeAbsoluteAmount(right.amount)
		);
	}

	private findConflictingRuleNames(
		rules: readonly BankTransactionRule[],
		candidate: BankTransactionRuleMatcher,
		excludeId?: BankTransactionRule['id'],
	): string[] {
		return rules
			.filter(({id, category}) => id !== excludeId && category !== candidate.category)
			.filter((rule) => this.rulesOverlap(this.toMatcher(rule), candidate))
			.map(({name}) => name);
	}

	private async ensureUniqueRuleName(
		ruleRepository: Repository<BankTransactionRule>,
		bankAccountId: BankAccount['id'],
		name: string,
		excludeId?: BankTransactionRule['id'],
	): Promise<void> {
		const existingRule = await ruleRepository.findOne({where: {bankAccountId, name}});
		if (existingRule && existingRule.id !== excludeId) {
			throw new ConflictException('A rule with this name already exists for this bank account.');
		}
	}

	private async lockBankAccount(manager: EntityManager, bankAccountId: BankAccount['id']): Promise<BankAccount> {
		const bankAccount = await manager.getRepository(BankAccount).findOne({
			where: {id: bankAccountId},
			lock: {mode: 'pessimistic_write'},
		});
		if (!bankAccount) throw new NotFoundException('Bank account not found.');
		return bankAccount;
	}

	private toMatcher(rule: BankTransactionRule): BankTransactionRuleMatcher {
		return {
			id: rule.id,
			bankAccountId: rule.bankAccountId,
			direction: rule.direction,
			transactionType: rule.transactionType,
			currency: rule.currency,
			amount: rule.amount,
			matchField: rule.matchField,
			matchText: rule.matchText,
			active: rule.active,
			category: rule.category,
		};
	}

	private toMatchInput(transaction: BankTransaction): BankTransactionRuleMatchInput {
		return {
			bankAccountId: transaction.bankAccountId,
			creditDebitIndicator: transaction.creditDebitIndicator,
			transactionType: transaction.transactionType,
			currency: transaction.currency,
			amount: transaction.amount,
			bankTransactionDescription: transaction.bankTransactionDescription,
			remittanceInformation: transaction.remittanceInformation,
		};
	}

	private toPreviewResponse(preview: InternalRulePreview): BankTransactionRulePreviewResponseDto {
		const manualMatches = preview.matchingTransactions.filter(({categorySource}) => categorySource === 'MANUAL');
		const ruleMatches = preview.matchingTransactions.filter(({categorySource}) => categorySource === 'RULE');
		const eligibleMatches = preview.matchingTransactions.filter(
			({categorySource}) => categorySource !== 'MANUAL' && categorySource !== 'RULE',
		);
		return {
			bankAccountId: preview.condition.bankAccountId,
			direction: preview.condition.direction,
			transactionType: preview.condition.transactionType,
			currency: preview.condition.currency,
			amount: preview.condition.amount,
			matchField: preview.condition.matchField,
			matchText: preview.condition.matchText,
			totalMatches: preview.matchingTransactions.length,
			existingManualMatches: manualMatches.length,
			existingRuleMatches: ruleMatches.length,
			existingEligibleMatches: eligibleMatches.length,
			conflictingRuleNames: preview.conflictingRuleNames,
			matches: preview.matchingTransactions
				.slice(0, PREVIEW_SAMPLE_SIZE)
				.map((transaction) => this.toPreviewTransaction(transaction)),
		};
	}

	private toPreviewTransaction(transaction: BankTransaction): BankTransactionRulePreviewTransactionDto {
		return {
			id: transaction.id,
			bookingDate: transaction.bookingDate,
			amount: transaction.amount,
			currency: transaction.currency,
			displayDescription: transaction.displayDescription,
			category: (transaction.category as BankTransactionRulePreviewTransactionDto['category']) ?? null,
			categorySource:
				(transaction.categorySource as BankTransactionRulePreviewTransactionDto['categorySource']) ?? null,
		};
	}

	private toRuleResponse(rule: BankTransactionRule): BankTransactionRuleResponseDto {
		return {
			id: rule.id,
			bankAccountId: rule.bankAccountId,
			bankAccountName: rule.bankAccount?.alias?.trim() || rule.bankAccount?.name?.trim() || null,
			name: rule.name,
			category: rule.category,
			active: rule.active,
			direction: rule.direction,
			transactionType: rule.transactionType,
			currency: rule.currency,
			amount: rule.amount,
			matchField: rule.matchField,
			matchText: rule.matchText,
			createdAt: rule.createdAt,
			updatedAt: rule.updatedAt,
		};
	}

	private async findOwnedTransaction(accountId: Account['id'], id: BankTransaction['id']): Promise<BankTransaction> {
		const transaction = await this.transactionRepository
			.createQueryBuilder('transaction')
			.innerJoinAndSelect('transaction.bankAccount', 'bankAccount')
			.innerJoin('bankAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('account.id = :accountId', {accountId})
			.andWhere('transaction.id = :transactionId', {transactionId: id})
			.getOne();
		if (!transaction) throw new NotFoundException(BANKING_TRANSACTION_NOT_FOUND);
		return transaction;
	}

	private async findOwnedRule(accountId: Account['id'], id: BankTransactionRule['id']): Promise<BankTransactionRule> {
		const rule = await this.createOwnedRuleQuery(accountId).andWhere('rule.id = :ruleId', {ruleId: id}).getOne();
		if (!rule) throw new NotFoundException('Bank transaction rule not found.');
		return rule;
	}

	private createOwnedRuleQuery(accountId: Account['id']) {
		return this.ruleRepository
			.createQueryBuilder('rule')
			.innerJoinAndSelect('rule.bankAccount', 'bankAccount')
			.innerJoin('bankAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('account.id = :accountId', {accountId});
	}
}
