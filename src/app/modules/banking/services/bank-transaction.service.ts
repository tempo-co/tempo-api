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
import {BankTransactionResponseDto, BankTransactionsResponseDto} from '../api/dtos/bank-transaction-response.dto';
import {BankConnection} from '../bank-connection.entity';
import {toBankTransactionDirection} from '../bank-transaction-direction';
import {getBankTransactionCashFlowTreatment} from '../bank-transaction-financial-event';
import {BANK_TRANSACTION_TYPES} from '../bank-transaction-type';
import {BankTransaction} from '../bank-transaction.entity';
import {createBankTransactionCategorizationInputHash} from '../categorization/bank-transaction-categorization-input';
import {BANK_TRANSACTION_CATEGORIZATION_RESET_VALUES} from '../categorization/bank-transaction-categorization.constants';
import {
	BANK_TRANSACTION_UNCATEGORIZED,
	type BankTransactionCategory,
} from '../categorization/bank-transaction-category';

@Injectable()
export class BankTransactionService {
	constructor(
		@InjectRepository(BankConnection)
		private readonly bankConnectionRepository: Repository<BankConnection>,
		@InjectRepository(BankTransaction)
		private readonly bankTransactionRepository: Repository<BankTransaction>,
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

		if (filter?.financialEventTypes && filter.financialEventTypes.length > 0) {
			query.andWhere('transaction.financialEventType IN (:...financialEventTypes)', {
				financialEventTypes: filter.financialEventTypes,
			});
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
				? 'transaction.amount'
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
			transactions: transactions.map((transaction) => this.toBankTransactionResponse(transaction)),
			total,
		};
	}

	async findById(accountId: Account['id'], id: BankTransaction['id']): Promise<BankTransactionResponseDto> {
		const transaction = await this.createOwnerScopedQuery(accountId)
			.andWhere('transaction.id = :transactionId', {transactionId: id})
			.getOne();

		if (!transaction) throw new NotFoundException(BANKING_TRANSACTION_NOT_FOUND);
		return this.toResponse(transaction);
	}

	async updateCategory(
		accountId: Account['id'],
		id: BankTransaction['id'],
		category: BankTransactionCategory,
	): Promise<BankTransactionResponseDto> {
		const transaction = await this.createOwnerScopedQuery(accountId)
			.andWhere('transaction.id = :transactionId', {transactionId: id})
			.getOne();

		if (!transaction) throw new NotFoundException(BANKING_TRANSACTION_NOT_FOUND);
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

	private async findOwnedConnection(accountId: Account['id'], connectionId: BankConnection['id']) {
		const connection = await this.bankConnectionRepository.findOne({
			where: {id: connectionId, account: {id: accountId}},
		});
		if (!connection) throw new NotFoundException(BANKING_CONNECTION_NOT_FOUND);
		return connection;
	}

	private createOwnerScopedQuery(accountId: Account['id']) {
		return this.bankTransactionRepository
			.createQueryBuilder('transaction')
			.innerJoinAndSelect('transaction.bankAccount', 'bankAccount')
			.innerJoinAndSelect('bankAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('account.id = :accountId', {accountId});
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
			referenceNumber: transaction.referenceNumber,
			referenceNumberScheme: transaction.referenceNumberScheme,
			bankName: transaction.bankAccount.bankConnection.aspspName,
			bankCountry: transaction.bankAccount.bankConnection.aspspCountry,
			bankAccountName: transaction.bankAccount.name,
			bankAccountAlias: transaction.bankAccount.alias,
		};
	}

	private toBankTransactionResponse(
		transaction: BankTransaction,
	): BankConnectionTransactionsResponseDto['transactions'][number] {
		return this.toSharedResponseFields(transaction);
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
			cashFlowTreatment: getBankTransactionCashFlowTreatment(transaction.financialEventType, direction),
			categoryConfidence: transaction.categoryConfidence,
			merchantCategoryCode: transaction.merchantCategoryCode,
			remittanceInformation: transaction.remittanceInformation,
		};
	}
}
