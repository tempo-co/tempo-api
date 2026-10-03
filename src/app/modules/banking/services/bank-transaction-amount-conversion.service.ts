import {Injectable, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {IsNull, Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {BankAccount} from '../bank-account.entity';
import {BankTransaction} from '../bank-transaction.entity';
import {BATCH_WRITE_CHUNK_SIZE, buildPostgresValuesList, chunkArray} from '../banking.utils';
import {
	FX_RATE_MAX_AGE_DAYS,
	addDays,
	convertUsingHistoricalRates,
	convertUsingProviderAmount,
	getBankTransactionRateDate,
	latestExpectedEcbRateDate,
	normalizeCurrency,
} from './bank-transaction-amount-conversion.utils';
import {FxRateService} from './fx-rate.service';

const DEFAULT_BASE_CURRENCY = 'EUR';

type TransactionGroup = {
	account: Account;
	transactions: BankTransaction[];
};

@Injectable()
export class BankTransactionAmountConversionService {
	private readonly logger = new Logger(BankTransactionAmountConversionService.name);

	constructor(
		@InjectRepository(Account)
		private readonly accountRepository: Repository<Account>,
		@InjectRepository(BankAccount)
		private readonly bankAccountRepository: Repository<BankAccount>,
		@InjectRepository(BankTransaction)
		private readonly bankTransactionRepository: Repository<BankTransaction>,
		private readonly fxRateService: FxRateService,
	) {}

	async backfill(now = new Date()): Promise<{scanned: number; converted: number}> {
		await this.refreshAccountCurrencyRates(now);

		const transactions = await this.bankTransactionRepository.find({
			select: {
				id: true,
				amount: true,
				currency: true,
				instructedAmount: true,
				instructedCurrency: true,
				transactionDate: true,
				bookingDate: true,
				bankAccount: {id: true, bankConnection: {id: true, account: {id: true, baseCurrency: true}}},
			},
			where: {amountInBaseCurrency: IsNull()},
			relations: {bankAccount: {bankConnection: {account: true}}},
			order: {createdAt: 'ASC'},
		});
		const groups = this.groupByAccount(transactions);
		let converted = 0;

		for (const {account, transactions: accountTransactions} of groups.values()) {
			const baseCurrency = await this.resolveBaseCurrency(account);
			const historicalTransactions = accountTransactions.filter(
				(transaction) =>
					convertUsingProviderAmount({
						amount: transaction.amount,
						currency: transaction.currency,
						baseCurrency,
						instructedAmount: transaction.instructedAmount,
						instructedCurrency: transaction.instructedCurrency,
					}) === null &&
					normalizeCurrency(transaction.currency) !== baseCurrency &&
					getBankTransactionRateDate(transaction.transactionDate, transaction.bookingDate) !== null,
			);
			const rateDates = historicalTransactions
				.map((transaction) => getBankTransactionRateDate(transaction.transactionDate, transaction.bookingDate))
				.filter((date): date is string => date !== null)
				.sort();
			if (rateDates.length > 0) {
				// Weekend and holiday transactions use the previous publication, so fetch from before the first date.
				await this.fxRateService.ensureRates(
					new Set(historicalTransactions.map(({currency}) => currency)),
					addDays(rateDates[0], -FX_RATE_MAX_AGE_DAYS),
					rateDates[rateDates.length - 1],
				);
			}

			const rateCache = new Map<string, number | null>();
			const conversions: [id: string, amountInBaseCurrency: string][] = [];
			for (const transaction of accountTransactions) {
				const amountInBaseCurrency = await this.convertTransaction(transaction, baseCurrency, rateCache);
				if (amountInBaseCurrency === null) continue;
				conversions.push([transaction.id, amountInBaseCurrency]);
			}
			await this.saveConversions(conversions);
			converted += conversions.length;
		}

		this.logger.debug(`Converted ${converted} of ${transactions.length} bank transaction amounts.`);
		return {scanned: transactions.length, converted};
	}

	/** Keeps rates current for every currency a balance or base amount may need, even without new transactions. */
	private async refreshAccountCurrencyRates(now: Date): Promise<void> {
		const rows = await this.bankAccountRepository.query(
			`SELECT DISTINCT UPPER("currency") AS "currency" FROM "bank_accounts" WHERE "isActive" = TRUE
			UNION
			SELECT DISTINCT UPPER("baseCurrency") FROM "accounts" WHERE "baseCurrency" IS NOT NULL`,
		);
		const currencies = (rows as Array<{currency: string}>).map(({currency}) => currency);
		await this.fxRateService.ensureLatestRates(currencies, latestExpectedEcbRateDate(now));
	}

	private async saveConversions(conversions: readonly [id: string, amountInBaseCurrency: string][]): Promise<void> {
		for (const chunk of chunkArray(conversions, BATCH_WRITE_CHUNK_SIZE)) {
			const values = buildPostgresValuesList(chunk, ['uuid', 'numeric']);
			await this.bankTransactionRepository.query(
				`UPDATE "bank_transactions" AS t
				SET "amountInBaseCurrency" = v."amountInBaseCurrency",
					"updatedAt" = CURRENT_TIMESTAMP
				FROM (VALUES ${values.sql}) AS v("id", "amountInBaseCurrency")
				WHERE t."id" = v."id"`,
				values.parameters,
			);
		}
	}

	private async convertTransaction(
		transaction: BankTransaction,
		baseCurrency: string,
		rateCache: Map<string, number | null>,
	): Promise<string | null> {
		const providerAmount = convertUsingProviderAmount({
			amount: transaction.amount,
			currency: transaction.currency,
			baseCurrency,
			instructedAmount: transaction.instructedAmount,
			instructedCurrency: transaction.instructedCurrency,
		});
		if (providerAmount !== null) return providerAmount;

		const rateDate = getBankTransactionRateDate(transaction.transactionDate, transaction.bookingDate);
		if (!rateDate) return null;
		const sourceRate = await this.getCachedRate(transaction.currency, rateDate, rateCache);
		const baseRate = await this.getCachedRate(baseCurrency, rateDate, rateCache);
		return convertUsingHistoricalRates(
			transaction.amount,
			transaction.currency,
			baseCurrency,
			sourceRate,
			baseRate,
		);
	}

	private async getCachedRate(
		currency: string,
		rateDate: string,
		rateCache: Map<string, number | null>,
	): Promise<number | null> {
		const key = `${currency}:${rateDate}`;
		if (rateCache.has(key)) return rateCache.get(key) ?? null;
		const rate = await this.fxRateService.getRateToEur(currency, rateDate);
		rateCache.set(key, rate);
		return rate;
	}

	private groupByAccount(transactions: BankTransaction[]): Map<string, TransactionGroup> {
		const groups = new Map<string, TransactionGroup>();
		for (const transaction of transactions) {
			const account = transaction.bankAccount?.bankConnection?.account;
			if (!account) continue;
			const existing = groups.get(account.id);
			if (existing) existing.transactions.push(transaction);
			else groups.set(account.id, {account, transactions: [transaction]});
		}
		return groups;
	}

	private async resolveBaseCurrency(account: Account): Promise<string> {
		const existingCurrency = normalizeCurrency(account.baseCurrency);
		if (existingCurrency) return existingCurrency;

		const preferredAccount = await this.bankAccountRepository
			.createQueryBuilder('bankAccount')
			.innerJoin('bankAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('account.id = :accountId', {accountId: account.id})
			.andWhere('bankAccount.isActive = TRUE')
			.select('bankAccount.currency', 'currency')
			.addSelect('COUNT(*)', 'count')
			.groupBy('bankAccount.currency')
			.orderBy('COUNT(*)', 'DESC')
			.addOrderBy('bankAccount.currency', 'ASC')
			.getRawOne<{currency?: string}>();
		const baseCurrency = normalizeCurrency(preferredAccount?.currency) ?? DEFAULT_BASE_CURRENCY;
		await this.accountRepository.update({id: account.id}, {baseCurrency});
		account.baseCurrency = baseCurrency;
		return baseCurrency;
	}
}
