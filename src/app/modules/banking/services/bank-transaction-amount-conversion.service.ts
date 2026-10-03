import {Injectable, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {BankAccount} from '../bank-account.entity';
import {BankTransaction} from '../bank-transaction.entity';
import {
	FX_RATE_MAX_AGE_DAYS,
	addDays,
	latestExpectedEcbRateDate,
	normalizeCurrency,
} from './bank-transaction-amount-conversion.utils';
import {FxRateService} from './fx-rate.service';

const DEFAULT_BASE_CURRENCY = 'EUR';

type PendingCurrency = {
	accountId: string;
	baseCurrency: string | null;
	currency: string;
	fromDate: string | null;
	toDate: string | null;
	count: number;
};

/** Normalized currency and rate date of a transaction, as used by the conversion. */
const RATE_DATE_SQL = `COALESCE(t."transactionDate", t."bookingDate")`;
const CURRENCY_SQL = `UPPER(BTRIM(t."currency"))`;
/** Rows without a conversion method are (re)converted, including amounts stored before methods were recorded. */
const PENDING_SQL = `t."baseAmountMethod" IS NULL`;
const INPUT_COLUMNS = [
	'amount',
	'currency',
	'transactionDate',
	'bookingDate',
	'instructedAmount',
	'instructedCurrency',
];

/**
 * The newest reference rate on or before the transaction's rate date that is final: the publication of that
 * date's business day itself, or, once a later publication is stored, the previous one (an ECB holiday).
 * Until then the row waits, so it never keeps an older rate just because the expected one is not out yet.
 * Holidays are inferred, not looked up: a weekday ECB skipped for any other reason is treated the same way.
 */
const rateLateral = (alias: string, currency: string) => `
	LEFT JOIN LATERAL (
		SELECT rate."rateToEur", rate."rateDate"
		FROM "bank_transaction_fx_rates" rate
		WHERE rate."currency" = ${currency}
			AND rate."rateDate" BETWEEN candidate."rateDate" - $3::integer AND candidate."rateDate"
			AND (
				rate."rateDate" = candidate."businessDate"
				OR EXISTS (
					SELECT 1 FROM "bank_transaction_fx_rates" later
					WHERE later."currency" = rate."currency" AND later."rateDate" > candidate."rateDate"
				)
			)
		ORDER BY rate."rateDate" DESC
		LIMIT 1
	) ${alias} ON TRUE`;

/**
 * Converts every unconverted transaction of one owner into their base currency, in exact cents:
 * same currency → copied; bank-reported amount in the base currency → `INSTRUCTED`; otherwise via the
 * ECB reference rates (pivoting through EUR) of the newest final publication at most {@link FX_RATE_MAX_AGE_DAYS}
 * days before the transaction. Rows without a usable rate stay pending and are retried on the next run.
 * The update re-checks the inputs, so a row a concurrent sync changed is left for the next run.
 */
const CONVERT_OWNER_SQL = `
	WITH candidate AS (
		SELECT
			t."id",
			t."amount",
			${CURRENCY_SQL} AS "currency",
			UPPER(BTRIM(t."instructedCurrency")) AS "instructedCurrency",
			t."instructedAmount",
			${RATE_DATE_SQL} AS "rateDate",
			${RATE_DATE_SQL} - CASE EXTRACT(ISODOW FROM ${RATE_DATE_SQL}) WHEN 6 THEN 1 WHEN 7 THEN 2 ELSE 0 END
				AS "businessDate",
			ROW(${INPUT_COLUMNS.map((column) => `t."${column}"`).join(', ')}) AS "inputs"
		FROM "bank_transactions" t
		INNER JOIN "bank_accounts" bank_account ON bank_account."id" = t."bankAccountId"
		INNER JOIN "bank_connections" connection ON connection."id" = bank_account."bankConnectionId"
		WHERE connection."accountId" = $1 AND ${PENDING_SQL}
	),
	priced AS (
		SELECT
			candidate.*,
			CASE WHEN candidate."currency" = 'EUR' THEN 1 ELSE source."rateToEur" END AS "sourceRate",
			CASE WHEN $2 = 'EUR' THEN 1 ELSE base."rateToEur" END AS "baseRate",
			GREATEST(source."rateDate", base."rateDate") AS "usedRateDate"
		FROM candidate
		${rateLateral('source', 'candidate."currency"')}
		${rateLateral('base', '$2')}
	),
	converted AS (
		SELECT
			priced."id",
			priced."inputs",
			CASE
				WHEN priced."currency" = $2 THEN ROUND(priced."amount", 2)
				WHEN priced."instructedCurrency" = $2 AND priced."instructedAmount" IS NOT NULL
					THEN ROUND(SIGN(priced."amount") * ABS(priced."instructedAmount"), 2)
				WHEN priced."sourceRate" > 0 AND priced."baseRate" > 0
					THEN ROUND(priced."amount" / priced."sourceRate" * priced."baseRate", 2)
			END AS "amountInBaseCurrency",
			CASE
				WHEN priced."currency" = $2 THEN 'SAME'
				WHEN priced."instructedCurrency" = $2 AND priced."instructedAmount" IS NOT NULL THEN 'INSTRUCTED'
				WHEN priced."sourceRate" > 0 AND priced."baseRate" > 0 THEN 'ECB'
			END AS "baseAmountMethod",
			CASE
				WHEN priced."currency" <> $2
					AND NOT (priced."instructedCurrency" = $2 AND priced."instructedAmount" IS NOT NULL)
				THEN priced."usedRateDate"
			END AS "baseAmountRateDate"
		FROM priced
	),
	updated AS (
		UPDATE "bank_transactions" t
		SET
			"amountInBaseCurrency" = converted."amountInBaseCurrency",
			"baseAmountMethod" = converted."baseAmountMethod",
			"baseAmountRateDate" = converted."baseAmountRateDate",
			"updatedAt" = CURRENT_TIMESTAMP
		FROM converted
		WHERE t."id" = converted."id"
			AND ${PENDING_SQL}
			AND ROW(${INPUT_COLUMNS.map((column) => `t."${column}"`).join(', ')}) IS NOT DISTINCT FROM converted."inputs"
			AND converted."amountInBaseCurrency" IS NOT NULL
		RETURNING 1
	)
	SELECT COUNT(*)::integer AS "count" FROM updated`;

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

		let scanned = 0;
		let converted = 0;
		for (const [accountId, pending] of await this.findPendingCurrencies()) {
			const baseCurrency = await this.resolveBaseCurrency(accountId, pending[0].baseCurrency);
			await this.ensureHistoricalRates(pending, baseCurrency, latestExpectedEcbRateDate(now));

			const [{count}] = (await this.bankTransactionRepository.query(CONVERT_OWNER_SQL, [
				accountId,
				baseCurrency,
				FX_RATE_MAX_AGE_DAYS,
			])) as Array<{count: number}>;
			scanned += pending.reduce((total, row) => total + row.count, 0);
			converted += count;
		}

		this.logger.debug(`Converted ${converted} of ${scanned} bank transaction amounts.`);
		return {scanned, converted};
	}

	/** Keeps rates current for every currency a balance or base amount may need, even without new transactions. */
	private async refreshAccountCurrencyRates(now: Date): Promise<void> {
		const rows = (await this.bankAccountRepository.query(
			`SELECT DISTINCT UPPER(BTRIM("currency")) AS "currency" FROM "bank_accounts" WHERE "isActive" = TRUE
			UNION
			SELECT DISTINCT UPPER(BTRIM("baseCurrency")) FROM "accounts" WHERE "baseCurrency" IS NOT NULL`,
		)) as Array<{currency: string}>;
		await this.fxRateService.ensureLatestRates(
			rows.map(({currency}) => currency),
			latestExpectedEcbRateDate(now),
		);
	}

	/** Unconverted rows per owner and currency, with the rate-date range each currency needs. */
	private async findPendingCurrencies(): Promise<Map<string, PendingCurrency[]>> {
		const rows = (await this.bankTransactionRepository.query(
			`SELECT
				connection."accountId",
				account."baseCurrency",
				${CURRENCY_SQL} AS "currency",
				to_char(MIN(${RATE_DATE_SQL}), 'YYYY-MM-DD') AS "fromDate",
				to_char(MAX(${RATE_DATE_SQL}), 'YYYY-MM-DD') AS "toDate",
				COUNT(*)::integer AS "count"
			FROM "bank_transactions" t
			INNER JOIN "bank_accounts" bank_account ON bank_account."id" = t."bankAccountId"
			INNER JOIN "bank_connections" connection ON connection."id" = bank_account."bankConnectionId"
			INNER JOIN "accounts" account ON account."id" = connection."accountId"
			WHERE ${PENDING_SQL}
			GROUP BY connection."accountId", account."baseCurrency", ${CURRENCY_SQL}
			ORDER BY connection."accountId", ${CURRENCY_SQL}`,
		)) as PendingCurrency[];

		const byOwner = new Map<string, PendingCurrency[]>();
		for (const row of rows) byOwner.set(row.accountId, [...(byOwner.get(row.accountId) ?? []), row]);
		return byOwner;
	}

	private async ensureHistoricalRates(
		pending: PendingCurrency[],
		baseCurrency: string,
		latestExpectedDate: string,
	): Promise<void> {
		const foreign = pending.filter(({currency, fromDate}) => currency !== baseCurrency && fromDate !== null);
		if (foreign.length === 0) return;

		const fromDate = foreign.map((row) => row.fromDate!).sort()[0];
		const toDate = foreign
			.map((row) => row.toDate!)
			.sort()
			.at(-1)!;
		// Weekend and holiday transactions use the previous publication, so fetch from before the first date.
		// A holiday row also needs a later publication to show the day had none, so fetch past the last date,
		// up to the newest rate that should already be published.
		const fetchUntil = addDays(toDate, FX_RATE_MAX_AGE_DAYS);
		await this.fxRateService.ensureRates(
			[...foreign.map(({currency}) => currency), baseCurrency],
			addDays(fromDate, -FX_RATE_MAX_AGE_DAYS),
			fetchUntil < latestExpectedDate ? fetchUntil : latestExpectedDate,
		);
	}

	private async resolveBaseCurrency(accountId: string, storedBaseCurrency: string | null): Promise<string> {
		const existingCurrency = normalizeCurrency(storedBaseCurrency);
		if (existingCurrency) return existingCurrency;

		const preferredAccount = await this.bankAccountRepository
			.createQueryBuilder('bankAccount')
			.innerJoin('bankAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('account.id = :accountId', {accountId})
			.andWhere('bankAccount.isActive = TRUE')
			.select('bankAccount.currency', 'currency')
			.addSelect('COUNT(*)', 'count')
			.groupBy('bankAccount.currency')
			.orderBy('COUNT(*)', 'DESC')
			.addOrderBy('bankAccount.currency', 'ASC')
			.getRawOne<{currency?: string}>();
		const baseCurrency = normalizeCurrency(preferredAccount?.currency) ?? DEFAULT_BASE_CURRENCY;
		await this.accountRepository.update({id: accountId}, {baseCurrency});
		return baseCurrency;
	}
}
