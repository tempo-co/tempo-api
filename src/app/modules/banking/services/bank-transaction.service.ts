import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Brackets, Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {BANKING_CONNECTION_NOT_FOUND, BANKING_TRANSACTION_NOT_FOUND} from '../api/constants/banking-messages.constants';
import {BankConnectionTransactionsResponseDto} from '../api/dtos/bank-connection-response.dto';
import {
	BankTransactionQueryDto,
	BankTransactionSortField,
	BankTransactionSortOrder,
	DEFAULT_BANK_TRANSACTION_PAGE_INDEX,
	DEFAULT_BANK_TRANSACTION_PAGE_SIZE,
} from '../api/dtos/bank-transaction-query.dto';
import {
	BankTransactionCounterpartDto,
	BankTransactionOwnTransferDto,
	BankTransactionResponseDto,
	BankTransactionsResponseDto,
} from '../api/dtos/bank-transaction-response.dto';
import {BankConnection} from '../bank-connection.entity';
import {toBankTransactionDirection} from '../bank-transaction-direction';
import {
	BANK_TRANSACTION_OWN_TRANSFER_FILTER,
	getBankTransactionCashFlowTreatment,
} from '../bank-transaction-financial-event';
import {BANK_TRANSACTION_TYPES} from '../bank-transaction-type';
import {BankTransaction} from '../bank-transaction.entity';
import {createBankTransactionCategorizationInputHash} from '../categorization/bank-transaction-categorization-input';
import {BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES} from '../categorization/bank-transaction-categorization.constants';
import {
	BANK_TRANSACTION_UNCATEGORIZED,
	type BankTransactionCategory,
} from '../categorization/bank-transaction-category';
import type {OwnTransferOverride} from '../own-transfer/own-transfer-detection';
import {OwnTransferService} from './own-transfer.service';

@Injectable()
export class BankTransactionService {
	constructor(
		@InjectRepository(BankConnection)
		private readonly bankConnectionRepository: Repository<BankConnection>,
		@InjectRepository(BankTransaction)
		private readonly bankTransactionRepository: Repository<BankTransaction>,
		private readonly ownTransferService: OwnTransferService,
	) {}

	async findAll(
		accountId: Account['id'],
		queryParams: BankTransactionQueryDto,
	): Promise<BankTransactionsResponseDto> {
		const pageIndex = queryParams.pagination?.pageIndex ?? DEFAULT_BANK_TRANSACTION_PAGE_INDEX;
		const pageSize = queryParams.pagination?.pageSize ?? DEFAULT_BANK_TRANSACTION_PAGE_SIZE;
		const query = this.createOwnerScopedQuery(accountId);

		const filter = queryParams.filter;
		const bookingDate = filter?.bookingDate;
		if (bookingDate?.from) {
			query.andWhere('transaction.bookingDate >= :bookingDateFrom', {bookingDateFrom: bookingDate.from});
		}
		if (bookingDate?.to) {
			query.andWhere('transaction.bookingDate <= :bookingDateTo', {bookingDateTo: bookingDate.to});
		}
		if (filter?.bankAccountIds && filter.bankAccountIds.length > 0) {
			query.andWhere('bankAccount.id IN (:...bankAccountIds)', {
				bankAccountIds: filter.bankAccountIds,
			});
		}
		const categoryFilters = filter?.categories;
		if (categoryFilters && categoryFilters.length > 0) {
			const categorizedCategories = categoryFilters.filter(
				(category) => category !== BANK_TRANSACTION_UNCATEGORIZED,
			);
			const includesUncategorized = categoryFilters.includes(BANK_TRANSACTION_UNCATEGORIZED);

			query.andWhere(
				new Brackets((categoryQuery) => {
					if (categorizedCategories.length > 0) {
						categoryQuery.where('transaction.category IN (:...categories)', {
							categories: categorizedCategories,
						});
					}
					if (includesUncategorized) {
						const uncategorizedCondition =
							'transaction.category IS NULL AND transaction.financialEventType IS NULL';
						if (categorizedCategories.length > 0) categoryQuery.orWhere(uncategorizedCondition);
						else categoryQuery.where(uncategorizedCondition);
					}
				}),
			);
		}
		if (filter?.categorySources && filter.categorySources.length > 0) {
			query.andWhere('transaction.categorySource IN (:...categorySources)', {
				categorySources: filter.categorySources,
			});
		}

		const eventFilters = filter?.financialEventTypes ?? [];
		const financialEventTypes = eventFilters.filter((value) => value !== BANK_TRANSACTION_OWN_TRANSFER_FILTER);
		const activityConditions = [
			...(financialEventTypes.length > 0 ? ['transaction.financialEventType IN (:...financialEventTypes)'] : []),
			...(eventFilters.includes(BANK_TRANSACTION_OWN_TRANSFER_FILTER)
				? ['transaction.ownTransferEvidence IS NOT NULL']
				: []),
		];
		if (activityConditions.length > 0) {
			query.andWhere(`(${activityConditions.join(' OR ')})`, {financialEventTypes});
		}

		const search = filter?.search?.trim();
		if (search) {
			query.andWhere(
				new Brackets((searchQuery) => {
					searchQuery
						.where('transaction.description ILIKE :search', {search: `%${search}%`})
						.orWhere('transaction.counterpartyName ILIKE :search', {search: `%${search}%`})
						.orWhere('transaction.remittanceInformation ILIKE :search', {search: `%${search}%`});
				}),
			);
		}

		const sortField = queryParams.sort?.by ?? BankTransactionSortField.BOOKING_DATE;
		const sortOrder = queryParams.sort?.order ?? BankTransactionSortOrder.DESC;
		const sortColumn =
			sortField === BankTransactionSortField.AMOUNT
				? 'transaction.amountInBaseCurrency'
				: sortField === BankTransactionSortField.CATEGORY
					? 'transaction.category'
					: sortField === BankTransactionSortField.SOURCE
						? 'connection.aspspName'
						: 'transaction.bookingDate';
		query.orderBy(sortColumn, sortOrder, 'NULLS LAST');
		if (sortField !== BankTransactionSortField.BOOKING_DATE) {
			query.addOrderBy('transaction.bookingDate', 'DESC', 'NULLS LAST');
		}
		query
			.addOrderBy('transaction.valueDate', 'DESC', 'NULLS LAST')
			.addOrderBy('transaction.id', 'DESC')
			.skip(pageIndex * pageSize)
			.take(pageSize);

		const [transactions, total] = await query.getManyAndCount();
		return {
			transactions: transactions.map((transaction) => this.toResponse(transaction)),
			total,
		};
	}

	async findAllByConnectionId(
		accountId: Account['id'],
		connectionId: BankConnection['id'],
		limit: number,
	): Promise<BankConnectionTransactionsResponseDto> {
		await this.findOwnedConnection(accountId, connectionId);

		const query = this.bankTransactionRepository
			.createQueryBuilder('transaction')
			.innerJoin('transaction.bankAccount', 'bankAccount')
			.innerJoin('bankAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('connection.id = :connectionId', {connectionId})
			.andWhere('account.id = :accountId', {accountId})
			.orderBy('transaction.bookingDate', 'DESC', 'NULLS LAST')
			.addOrderBy('transaction.valueDate', 'DESC', 'NULLS LAST')
			.addOrderBy('transaction.createdAt', 'DESC')
			.take(limit);

		const [transactions, total] = await query.getManyAndCount();
		return {
			transactions: transactions.map((transaction) => this.toSharedResponseFields(transaction)),
			total,
		};
	}

	async findById(accountId: Account['id'], id: BankTransaction['id']): Promise<BankTransactionResponseDto> {
		return this.toResponse(await this.findOwnedTransaction(accountId, id));
	}

	async updateCategory(
		accountId: Account['id'],
		id: BankTransaction['id'],
		category: BankTransactionCategory,
	): Promise<BankTransactionResponseDto> {
		const transaction = await this.findOwnedTransaction(accountId, id);
		const inputHash = createBankTransactionCategorizationInputHash(transaction);
		const values = {
			...BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES,
			category,
			categoryStatus: 'COMPLETED',
			categorySource: 'MANUAL',
			categoryInputHash: inputHash,
			categoryAppliedInputHash: inputHash,
			categoryUpdatedAt: new Date(),
		};
		const result = await this.bankTransactionRepository.update({id}, values);
		if (result.affected === 0) throw new NotFoundException(BANKING_TRANSACTION_NOT_FOUND);
		Object.assign(transaction, values);

		return this.toResponse(transaction);
	}

	async updateOwnTransferOverride(
		accountId: Account['id'],
		id: BankTransaction['id'],
		override: OwnTransferOverride | null,
	): Promise<BankTransactionResponseDto> {
		const updated = await this.ownTransferService.updateOverride(accountId, id, override);
		if (!updated) throw new NotFoundException(BANKING_TRANSACTION_NOT_FOUND);
		return this.findById(accountId, id);
	}

	private async findOwnedConnection(accountId: Account['id'], connectionId: BankConnection['id']) {
		const connection = await this.bankConnectionRepository.findOne({
			where: {id: connectionId, account: {id: accountId}},
		});
		if (!connection) throw new NotFoundException(BANKING_CONNECTION_NOT_FOUND);
		return connection;
	}

	private async findOwnedTransaction(accountId: Account['id'], id: BankTransaction['id']) {
		const transaction = await this.createOwnerScopedQuery(accountId)
			.andWhere('transaction.id = :transactionId', {transactionId: id})
			.getOne();
		if (!transaction) throw new NotFoundException(BANKING_TRANSACTION_NOT_FOUND);
		return transaction;
	}

	private createOwnerScopedQuery(accountId: Account['id']) {
		return (
			this.bankTransactionRepository
				.createQueryBuilder('transaction')
				.innerJoinAndSelect('transaction.bankAccount', 'bankAccount')
				.innerJoinAndSelect('bankAccount.bankConnection', 'connection')
				.innerJoin('connection.account', 'account')
				// Recognition only links legs of the same owner.
				.leftJoinAndSelect('transaction.ownTransferCounterpart', 'counterpart')
				.leftJoinAndSelect('counterpart.bankAccount', 'counterpartBankAccount')
				.leftJoinAndSelect('counterpartBankAccount.bankConnection', 'counterpartConnection')
				.leftJoinAndSelect('transaction.currencyExchangeCounterpart', 'exchangeCounterpart')
				.leftJoinAndSelect('exchangeCounterpart.bankAccount', 'exchangeCounterpartBankAccount')
				.leftJoinAndSelect('exchangeCounterpartBankAccount.bankConnection', 'exchangeCounterpartConnection')
				.where('account.id = :accountId', {accountId})
		);
	}

	private toResponse(transaction: BankTransaction): BankTransactionResponseDto {
		return {
			...this.toSharedResponseFields(transaction),
			transactionDate: transaction.transactionDate,
			direction: toBankTransactionDirection(transaction.creditDebitIndicator),
			transactionType: transaction.transactionType ?? BANK_TRANSACTION_TYPES.OTHER,
			providerTransactionDescription: transaction.bankTransactionDescription,
			balanceAfterAmount: transaction.balanceAfterAmount,
			balanceAfterCurrency: transaction.balanceAfterCurrency,
			instructedAmount: transaction.instructedAmount,
			instructedCurrency: transaction.instructedCurrency,
			exchangeRate: transaction.exchangeRate,
			exchangeRateUnitCurrency: transaction.exchangeRateUnitCurrency,
			exchangeRateType: transaction.exchangeRateType,
			baseAmountMethod: transaction.baseAmountMethod,
			baseAmountRateDate: transaction.baseAmountRateDate,
			referenceNumber: transaction.referenceNumber,
			referenceNumberScheme: transaction.referenceNumberScheme,
			bankName: transaction.bankAccount.bankConnection.aspspName,
			bankCountry: transaction.bankAccount.bankConnection.aspspCountry,
			bankAccountName: transaction.bankAccount.name,
			bankAccountAlias: transaction.bankAccount.alias,
			ownTransfer: this.toOwnTransferResponse(transaction),
			ownTransferOverride: transaction.ownTransferOverride ?? null,
			currencyExchangeCounterpart: this.toCounterpartResponse(transaction.currencyExchangeCounterpart),
		};
	}

	private toOwnTransferResponse(transaction: BankTransaction): BankTransactionOwnTransferDto | null {
		if (!transaction.ownTransferEvidence) return null;
		return {
			evidence: transaction.ownTransferEvidence,
			counterpart: this.toCounterpartResponse(transaction.ownTransferCounterpart),
		};
	}

	private toCounterpartResponse(
		counterpart: BankTransaction | null | undefined,
	): BankTransactionCounterpartDto | null {
		if (!counterpart) return null;
		return {
			id: counterpart.id,
			bankName: counterpart.bankAccount.bankConnection.aspspName,
			bankAccountName: counterpart.bankAccount.name,
			bankAccountAlias: counterpart.bankAccount.alias,
			amount: counterpart.amount,
			currency: counterpart.currency,
			bookingDate: counterpart.bookingDate,
		};
	}

	private toSharedResponseFields(transaction: BankTransaction) {
		const direction = toBankTransactionDirection(transaction.creditDebitIndicator);
		return {
			id: transaction.id,
			bookingDate: transaction.bookingDate,
			valueDate: transaction.valueDate,
			amount: transaction.amount,
			currency: transaction.currency,
			creditDebitIndicator: transaction.creditDebitIndicator,
			transactionStatus: transaction.transactionStatus,
			description: transaction.description,
			displayDescription: transaction.displayDescription,
			counterpartyName: transaction.counterpartyName,
			category: (transaction.category as BankTransactionResponseDto['category']) ?? null,
			categoryStatus: (transaction.categoryStatus ?? 'PENDING') as BankTransactionResponseDto['categoryStatus'],
			categorySource: (transaction.categorySource as BankTransactionResponseDto['categorySource']) ?? null,
			financialEventType: transaction.financialEventType,
			financialEventSource: transaction.financialEventSource,
			financialEventRuleVersion: transaction.financialEventRuleVersion,
			cashFlowTreatment: getBankTransactionCashFlowTreatment(
				transaction.financialEventType,
				direction,
				transaction.ownTransferEvidence,
			),
			categoryConfidence: transaction.categoryConfidence,
			merchantCategoryCode: transaction.merchantCategoryCode,
			remittanceInformation: transaction.remittanceInformation,
		};
	}
}
