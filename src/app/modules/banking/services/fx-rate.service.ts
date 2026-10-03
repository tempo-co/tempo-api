import {Injectable, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {BankTransactionFxRate} from '../bank-transaction-fx-rate.entity';
import {FX_RATE_MAX_AGE_DAYS, addDays, normalizeCurrency} from './bank-transaction-amount-conversion.utils';

const ECB_DATA_API_URL = 'https://data-api.ecb.europa.eu/service/data/EXR';
const ECB_PROVIDER = 'ECB';
const REQUEST_TIMEOUT_MS = 15_000;
/** The longest span between consecutive ECB publications: Easter, or Christmas next to a weekend. */
const MAX_PUBLICATION_GAP_DAYS = 5;

type FxRateRow = {
	currency: string;
	rateDate: string;
	rateToEur: string;
	provider: string;
};

@Injectable()
export class FxRateService {
	private readonly logger = new Logger(FxRateService.name);

	constructor(
		@InjectRepository(BankTransactionFxRate)
		private readonly fxRateRepository: Repository<BankTransactionFxRate>,
	) {}

	async ensureRates(currencies: Iterable<string>, fromDate: string, toDate: string): Promise<void> {
		for (const rawCurrency of new Set(currencies)) {
			const currency = normalizeCurrency(rawCurrency);
			if (!currency || currency === 'EUR') continue;
			if (await this.hasCoverage(currency, fromDate, toDate)) continue;

			try {
				const rates = await this.fetchRates(currency, fromDate, toDate);
				if (rates.length > 0) await this.fxRateRepository.upsert(rates, ['currency', 'rateDate']);
			} catch (error) {
				this.logger.warn(
					`Historical FX rate fetch failed for ${currency}: ${error instanceof Error ? error.message : 'unknown error'}`,
				);
			}
		}
	}

	/**
	 * Fetches rates published since the newest stored one, so currencies without recent transactions stay current.
	 * A currency with no stored rate fetches the last {@link FX_RATE_MAX_AGE_DAYS} days.
	 */
	async ensureLatestRates(currencies: Iterable<string>, latestExpectedDate: string): Promise<void> {
		for (const rawCurrency of new Set(currencies)) {
			const currency = normalizeCurrency(rawCurrency);
			if (!currency || currency === 'EUR') continue;

			const latest = await this.fxRateRepository
				.createQueryBuilder('fxRate')
				.select(`to_char(MAX(fxRate.rateDate), 'YYYY-MM-DD')`, 'rateDate')
				.where('fxRate.currency = :currency', {currency})
				.getRawOne<{rateDate: string | null}>();
			const latestDate = latest?.rateDate ?? null;
			if (latestDate && latestDate >= latestExpectedDate) continue;

			await this.ensureRates(
				[currency],
				latestDate ?? addDays(latestExpectedDate, -FX_RATE_MAX_AGE_DAYS),
				latestExpectedDate,
			);
		}
	}

	async getRateToEur(currency: string, rateDate: string): Promise<number | null> {
		const normalizedCurrency = normalizeCurrency(currency);
		if (!normalizedCurrency) return null;
		if (normalizedCurrency === 'EUR') return 1;

		const rate = await this.fxRateRepository
			.createQueryBuilder('fxRate')
			.where('fxRate.currency = :currency', {currency: normalizedCurrency})
			.andWhere('fxRate.rateDate <= :rateDate', {rateDate})
			.orderBy('fxRate.rateDate', 'DESC')
			.getOne();
		if (!rate) return null;

		const parsedRate = Number(rate.rateToEur);
		return Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null;
	}

	/**
	 * Whether stored rates span the range without a gap longer than ECB ever leaves (a holiday weekend), so
	 * a range fetched in pieces, e.g. around an outage, is fetched again rather than treated as complete.
	 */
	private async hasCoverage(currency: string, fromDate: string, toDate: string): Promise<boolean> {
		const [coverage] = (await this.fxRateRepository.query(
			`WITH stored AS (
				SELECT "rateDate", LAG("rateDate") OVER (ORDER BY "rateDate") AS "previousDate"
				FROM "bank_transaction_fx_rates"
				WHERE "currency" = $1
			)
			SELECT
				to_char(MIN("rateDate"), 'YYYY-MM-DD') AS "minimumDate",
				to_char(MAX("rateDate"), 'YYYY-MM-DD') AS "maximumDate",
				COALESCE(BOOL_OR(
					"rateDate" - "previousDate" > $4 AND "rateDate" > $2::date AND "previousDate" < $3::date
				), FALSE) AS "hasGap"
			FROM stored`,
			[currency, fromDate, toDate, MAX_PUBLICATION_GAP_DAYS],
		)) as Array<{minimumDate: string | null; maximumDate: string | null; hasGap: boolean}>;
		return Boolean(
			coverage?.minimumDate &&
			coverage.maximumDate &&
			coverage.minimumDate <= fromDate &&
			coverage.maximumDate >= toDate &&
			!coverage.hasGap,
		);
	}

	private async fetchRates(currency: string, fromDate: string, toDate: string): Promise<FxRateRow[]> {
		const url = `${ECB_DATA_API_URL}/D.${encodeURIComponent(currency)}.EUR.SP00.A?startPeriod=${encodeURIComponent(fromDate)}&endPeriod=${encodeURIComponent(toDate)}&format=csvdata`;
		const response = await fetch(url, {
			headers: {Accept: 'text/csv'},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) throw new Error(`ECB responded with HTTP ${response.status}`);

		return this.parseCsv(await response.text(), currency);
	}

	private parseCsv(csv: string, currency: string): FxRateRow[] {
		const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
		if (lines.length < 2) return [];
		const headers = lines[0].split(',');
		const dateIndex = headers.indexOf('TIME_PERIOD');
		const valueIndex = headers.indexOf('OBS_VALUE');
		if (dateIndex < 0 || valueIndex < 0) throw new Error('ECB response omitted rate columns');

		return lines.slice(1).flatMap((line) => {
			const fields = line.split(',');
			const rateDate = fields[dateIndex];
			const rateToEur = fields[valueIndex];
			if (!/^\d{4}-\d{2}-\d{2}$/.test(rateDate ?? '')) return [];
			const parsedRate = Number(rateToEur);
			if (!Number.isFinite(parsedRate) || parsedRate <= 0) return [];
			return [{currency, rateDate, rateToEur, provider: ECB_PROVIDER}];
		});
	}
}
