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
import {toBankTransactionDirection} from '../bank-transaction-direction';
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
			const ruleRepository = manager.getRepository(BankTransactionRule);
			const rule = await ruleRepository.save(
				ruleRepository.create({
					...preview.condition,
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
		const rule = await this.findOwnedRule(accountId, id);
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

		const conflictingRules = await this.ruleRepository.find({
			where: {bankAccountId: rule.bankAccountId, active: true},
		});
		const candidate = {...rule, ...nextValues};
		const conflictingRuleNames = conflictingRules
			.filter((existing) => existing.id !== rule.id && existing.category !== candidate.category)
			.filter((existing) => this.rulesOverlap(existing, candidate))
			.map(({name}) => name);
		if (conflictingRuleNames.length > 0 && candidate.active) {
			throw new ConflictException(
				`This condition conflicts with active rules: ${conflictingRuleNames.join(', ')}.`,
			);
		}

		Object.assign(rule, nextValues);
		return this.toRuleResponse(await this.ruleRepository.save(rule));
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
			if (transaction.categorySource === 'MANUAL' || transaction.categorySource === 'RULE') continue;
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
				order: {bookingDate: 'DESC', valueDate: 'DESC', id: 'DESC'},
			}),
			this.ruleRepository.find({where: {bankAccountId: source.bankAccountId, active: true}}),
		]);
		const matchingTransactions = transactions.filter((transaction) =>
			matchesBankTransactionRule(draft, this.toMatchInput(transaction)),
		);
		const conflictingRuleNames = activeRules
			.filter((rule) => rule.category !== dto.category)
			.filter((rule) => this.rulesOverlap(rule, draft))
			.map(({name}) => name);

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
		return (
			left.bankAccountId === right.bankAccountId &&
			left.direction === right.direction &&
			left.transactionType.toUpperCase() === right.transactionType.toUpperCase() &&
			left.currency.toUpperCase() === right.currency.toUpperCase() &&
			normalizeAbsoluteAmount(left.amount) === normalizeAbsoluteAmount(right.amount) &&
			left.matchField === right.matchField &&
			(this.normalizedText(left.matchText).includes(this.normalizedText(right.matchText)) ||
				this.normalizedText(right.matchText).includes(this.normalizedText(left.matchText)))
		);
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
			description: transaction.description,
			remittanceInformation: transaction.remittanceInformation,
		};
	}

	private normalizedText(value: string): string {
		return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
	}

	private toPreviewResponse(preview: InternalRulePreview): BankTransactionRulePreviewResponseDto {
		const manualMatches = preview.matchingTransactions.filter(({categorySource}) => categorySource === 'MANUAL');
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
			isManual: transaction.categorySource === 'MANUAL',
		};
	}

	private toRuleResponse(rule: BankTransactionRule): BankTransactionRuleResponseDto {
		return {
			id: rule.id,
			bankAccountId: rule.bankAccountId,
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
