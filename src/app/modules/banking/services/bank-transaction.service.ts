import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Brackets, Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {BANKING_CONNECTION_NOT_FOUND, BANKING_TRANSACTION_NOT_FOUND} from '../api/constants/banking-messages.constants';
import {ExternalTransactionsResponseDto} from '../api/dtos/bank-connection-response.dto';
import {
	BankTransactionQueryDto,
	BankTransactionSortField,
	BankTransactionSortOrder,
	DEFAULT_BANK_TRANSACTION_PAGE_INDEX,
	DEFAULT_BANK_TRANSACTION_PAGE_SIZE,
} from '../api/dtos/bank-transaction-query.dto';
import {
	BankTransactionDirection,
	BankTransactionResponseDto,
	BankTransactionsResponseDto,
} from '../api/dtos/bank-transaction-response.dto';
import {BankConnection} from '../bank-connection.entity';
import {BANK_TRANSACTION_TYPES} from '../bank-transaction-type';
import {ExternalTransaction} from '../external-transaction.entity';

@Injectable()
export class BankTransactionService {
	constructor(
		@InjectRepository(BankConnection)
		private readonly bankConnectionRepository: Repository<BankConnection>,
		@InjectRepository(ExternalTransaction)
		private readonly externalTransactionRepository: Repository<ExternalTransaction>,
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
		if (filter?.externalAccountIds && filter.externalAccountIds.length > 0) {
			query.andWhere('externalAccount.id IN (:...externalAccountIds)', {
				externalAccountIds: filter.externalAccountIds,
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
			sortField === BankTransactionSortField.AMOUNT ? 'transaction.amount' : 'transaction.bookingDate';
		query
			.orderBy(sortColumn, sortOrder, 'NULLS LAST')
			.addOrderBy('transaction.bookingDate', 'DESC', 'NULLS LAST')
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
	): Promise<ExternalTransactionsResponseDto> {
		await this.findOwnedConnection(accountId, connectionId);

		const query = this.externalTransactionRepository
			.createQueryBuilder('transaction')
			.innerJoin('transaction.externalAccount', 'externalAccount')
			.innerJoin('externalAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('connection.id = :connectionId', {connectionId})
			.andWhere('account.id = :accountId', {accountId})
			.orderBy('transaction.bookingDate', 'DESC', 'NULLS LAST')
			.addOrderBy('transaction.valueDate', 'DESC', 'NULLS LAST')
			.addOrderBy('transaction.createdAt', 'DESC')
			.take(limit);

		const [transactions, total] = await query.getManyAndCount();
		return {
			transactions: transactions.map((transaction) => this.toExternalTransactionResponse(transaction)),
			total,
		};
	}

	async findById(accountId: Account['id'], id: ExternalTransaction['id']): Promise<BankTransactionResponseDto> {
		const transaction = await this.createOwnerScopedQuery(accountId)
			.andWhere('transaction.id = :transactionId', {transactionId: id})
			.getOne();

		if (!transaction) throw new NotFoundException(BANKING_TRANSACTION_NOT_FOUND);
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
		return this.externalTransactionRepository
			.createQueryBuilder('transaction')
			.innerJoinAndSelect('transaction.externalAccount', 'externalAccount')
			.innerJoinAndSelect('externalAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('account.id = :accountId', {accountId});
	}

	private toResponse(transaction: ExternalTransaction): BankTransactionResponseDto {
		return {
			id: transaction.id,
			transactionDate: transaction.transactionDate,
			bookingDate: transaction.bookingDate,
			valueDate: transaction.valueDate,
			description: transaction.description,
			counterpartyName: transaction.counterpartyName,
			amount: transaction.amount,
			currency: transaction.currency,
			creditDebitIndicator: transaction.creditDebitIndicator,
			direction: this.toDirection(transaction.creditDebitIndicator),
			transactionType: transaction.transactionType ?? BANK_TRANSACTION_TYPES.OTHER,
			transactionStatus: transaction.transactionStatus,
			providerTransactionDescription: transaction.bankTransactionDescription,
			merchantCategoryCode: transaction.merchantCategoryCode,
			remittanceInformation: transaction.remittanceInformation,
			balanceAfterAmount: transaction.balanceAfterAmount,
			balanceAfterCurrency: transaction.balanceAfterCurrency,
			instructedAmount: transaction.instructedAmount,
			instructedCurrency: transaction.instructedCurrency,
			exchangeRate: transaction.exchangeRate,
			exchangeRateUnitCurrency: transaction.exchangeRateUnitCurrency,
			exchangeRateType: transaction.exchangeRateType,
			referenceNumber: transaction.referenceNumber,
			referenceNumberScheme: transaction.referenceNumberScheme,
			bankName: transaction.externalAccount.bankConnection.aspspName,
			bankCountry: transaction.externalAccount.bankConnection.aspspCountry,
			externalAccountName: transaction.externalAccount.name,
			externalAccountAlias: transaction.externalAccount.alias,
		};
	}

	private toExternalTransactionResponse(
		transaction: ExternalTransaction,
	): ExternalTransactionsResponseDto['transactions'][number] {
		return {
			id: transaction.id,
			bookingDate: transaction.bookingDate,
			valueDate: transaction.valueDate,
			amount: transaction.amount,
			currency: transaction.currency,
			creditDebitIndicator: transaction.creditDebitIndicator,
			transactionStatus: transaction.transactionStatus,
			description: transaction.description,
			counterpartyName: transaction.counterpartyName,
			merchantCategoryCode: transaction.merchantCategoryCode,
			remittanceInformation: transaction.remittanceInformation,
		};
	}

	private toDirection(indicator: string | null): BankTransactionDirection {
		const normalizedIndicator = indicator?.toUpperCase();
		if (normalizedIndicator === 'CRDT') return BankTransactionDirection.INCOME;
		if (normalizedIndicator === 'DBIT') return BankTransactionDirection.EXPENSE;
		return BankTransactionDirection.UNKNOWN;
	}
}
