import {Brackets, SelectQueryBuilder} from 'typeorm';

import type {BankTransactionFilterQueryDto} from '../api/dtos/bank-transaction-query.dto';
import {BANK_TRANSACTION_OWN_TRANSFER_FILTER} from '../bank-transaction-financial-event';
import type {BankTransaction} from '../bank-transaction.entity';
import {BANK_TRANSACTION_UNCATEGORIZED} from '../categorization/bank-transaction-category';

/**
 * Applies the Transactions list filters to an owner-scoped query whose transaction alias is `transaction` and whose
 * bank account alias is `bankAccount`. Shared so every summary number reconciles with a filtered list.
 */
export function applyBankTransactionFilters(
	query: SelectQueryBuilder<BankTransaction>,
	filter: BankTransactionFilterQueryDto | undefined,
): void {
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
		const categorizedCategories = categoryFilters.filter((category) => category !== BANK_TRANSACTION_UNCATEGORIZED);
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
}
