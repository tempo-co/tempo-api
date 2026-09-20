import {BadRequestException, Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Brackets, Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {BANKING_CONNECTION_NOT_FOUND, BANKING_TRANSACTION_NOT_FOUND} from '../api/constants/banking-messages.constants';
import {
	BANK_CASH_FLOW_MAX_BUCKETS,
	BankCashFlowGranularityQuery,
	BankCashFlowQueryDto,
} from '../api/dtos/bank-cash-flow-query.dto';
import {
	BankCashFlowBucketResponseDto,
	BankCashFlowGranularityResponse,
	BankCashFlowResponseDto,
	BankCashFlowTotalsResponseDto,
} from '../api/dtos/bank-cash-flow-response.dto';
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
import {
	BANK_TRANSACTION_FINANCIAL_EVENT_TYPES,
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
import {
	addDecimalStrings,
	createCashFlowBuckets,
	normalizeDecimal,
	subtractDecimalStrings,
} from './bank-cash-flow.utils';

type CashFlowAggregateRow = {
	currency: string;
	bucketStart: string;
	income: string;
	expenses: string;
	transactionCount: string;
	includedTransactionCount: string;
	internalCount: string;
	unknownCount: string;
};

type CashFlowSeriesAccumulator = {
	currency: string;
	buckets: Map<string, BankCashFlowBucketResponseDto>;
	totals: BankCashFlowTotalsResponseDto;
};

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
		if (filter?.currency) {
			query.andWhere('transaction.currency = :currency', {currency: filter.currency});
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

	async findCashFlow(accountId: Account['id'], queryParams: BankCashFlowQueryDto): Promise<BankCashFlowResponseDto> {
		if (queryParams.from > queryParams.to) {
			throw new BadRequestException('Cash-flow range must start before it ends.');
		}

		const buckets = createCashFlowBuckets(queryParams.from, queryParams.to, queryParams.granularity);
		if (buckets.length > BANK_CASH_FLOW_MAX_BUCKETS[queryParams.granularity]) {
			throw new BadRequestException('Cash-flow range is too large for the selected granularity.');
		}

		const bucketStartExpression = `TO_CHAR(DATE_TRUNC('${queryParams.granularity}', "transaction"."bookingDate"::timestamp), 'YYYY-MM-DD')`;
		const incomeCondition = `"transaction"."financialEventType" IS NULL AND UPPER("transaction"."creditDebitIndicator") = 'CRDT'`;
		const expenseCondition = `"transaction"."financialEventType" IS NULL AND UPPER("transaction"."creditDebitIndicator") = 'DBIT'`;
		const internalCondition = '"transaction"."financialEventType" = :internalEventType';
		const unknownCondition = `(
			("transaction"."financialEventType" IS NULL AND COALESCE(UPPER("transaction"."creditDebitIndicator"), '') NOT IN ('CRDT', 'DBIT'))
			OR ("transaction"."financialEventType" IS NOT NULL AND "transaction"."financialEventType" <> :internalEventType)
		)`;
		const includedCondition = `(${incomeCondition} OR ${expenseCondition})`;

		const aggregateRows = await this.createOwnerScopedAggregateQuery(accountId)
			.andWhere('transaction.bookingDate BETWEEN :from AND :to', {
				from: queryParams.from,
				to: queryParams.to,
			})
			.select('transaction.currency', 'currency')
			.addSelect(bucketStartExpression, 'bucketStart')
			.addSelect(
				`COALESCE(SUM(CASE WHEN ${incomeCondition} THEN ABS(transaction.amount) ELSE 0 END), 0)::text`,
				'income',
			)
			.addSelect(
				`COALESCE(SUM(CASE WHEN ${expenseCondition} THEN ABS(transaction.amount) ELSE 0 END), 0)::text`,
				'expenses',
			)
			.addSelect('COUNT(*)::text', 'transactionCount')
			.addSelect(`COUNT(*) FILTER (WHERE ${includedCondition})::text`, 'includedTransactionCount')
			.addSelect(`COUNT(*) FILTER (WHERE ${internalCondition})::text`, 'internalCount')
			.addSelect(`COUNT(*) FILTER (WHERE ${unknownCondition})::text`, 'unknownCount')
			.groupBy('transaction.currency')
			.addGroupBy(bucketStartExpression)
			.orderBy('transaction.currency', 'ASC')
			.addOrderBy(bucketStartExpression, 'ASC')
			.setParameter('internalEventType', BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE)
			.getRawMany<CashFlowAggregateRow>();

		const missingBookingDateCount = await this.createOwnerScopedAggregateQuery(accountId)
			.andWhere('transaction.bookingDate IS NULL')
			.getCount();
		const seriesByCurrency = new Map<string, CashFlowSeriesAccumulator>();

		for (const row of aggregateRows) {
			const series = seriesByCurrency.get(row.currency) ?? createCashFlowSeriesAccumulator(row.currency, buckets);
			seriesByCurrency.set(row.currency, series);
			const bucket = series.buckets.get(String(row.bucketStart).slice(0, 10));
			if (!bucket) continue;

			bucket.income = normalizeDecimal(row.income);
			bucket.expenses = normalizeDecimal(row.expenses);
			bucket.net = subtractDecimalStrings(bucket.income, bucket.expenses);
			bucket.transactionCount = Number(row.transactionCount);
			bucket.includedTransactionCount = Number(row.includedTransactionCount);
			bucket.internalCount = Number(row.internalCount);
			bucket.unknownCount = Number(row.unknownCount);

			series.totals.income = addDecimalStrings(series.totals.income, bucket.income);
			series.totals.expenses = addDecimalStrings(series.totals.expenses, bucket.expenses);
			series.totals.net = subtractDecimalStrings(series.totals.income, series.totals.expenses);
			series.totals.transactionCount += bucket.transactionCount;
			series.totals.includedTransactionCount += bucket.includedTransactionCount;
			series.totals.internalCount += bucket.internalCount;
			series.totals.unknownCount += bucket.unknownCount;
		}

		const responseGranularity = {
			[BankCashFlowGranularityQuery.WEEK]: BankCashFlowGranularityResponse.WEEK,
			[BankCashFlowGranularityQuery.MONTH]: BankCashFlowGranularityResponse.MONTH,
			[BankCashFlowGranularityQuery.YEAR]: BankCashFlowGranularityResponse.YEAR,
		}[queryParams.granularity];

		return {
			granularity: responseGranularity,
			from: queryParams.from,
			to: queryParams.to,
			series: Array.from(seriesByCurrency.values())
				.sort((left, right) => left.currency.localeCompare(right.currency))
				.map((series) => ({
					currency: series.currency,
					buckets: Array.from(series.buckets.values()),
					totals: series.totals,
				})),
			dataQuality: {missingBookingDateCount},
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

	private createOwnerScopedAggregateQuery(accountId: Account['id']) {
		return this.bankTransactionRepository
			.createQueryBuilder('transaction')
			.innerJoin('transaction.bankAccount', 'bankAccount')
			.innerJoin('bankAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('account.id = :accountId', {accountId});
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

function createCashFlowSeriesAccumulator(
	currency: string,
	buckets: ReturnType<typeof createCashFlowBuckets>,
): CashFlowSeriesAccumulator {
	return {
		currency,
		buckets: new Map(
			buckets.map((bucket) => [
				bucket.bucketStart,
				{
					startDate: bucket.startDate,
					endDate: bucket.endDate,
					income: '0',
					expenses: '0',
					net: '0',
					transactionCount: 0,
					includedTransactionCount: 0,
					internalCount: 0,
					unknownCount: 0,
				},
			]),
		),
		totals: {
			income: '0',
			expenses: '0',
			net: '0',
			transactionCount: 0,
			includedTransactionCount: 0,
			internalCount: 0,
			unknownCount: 0,
		},
	};
}
