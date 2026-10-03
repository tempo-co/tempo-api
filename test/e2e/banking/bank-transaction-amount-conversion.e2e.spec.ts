import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';
import {BankAccount} from '@modules/banking/bank-account.entity';
import {BankTransactionFxRate} from '@modules/banking/bank-transaction-fx-rate.entity';
import {BankTransactionAmountConversionService} from '@modules/banking/services/bank-transaction-amount-conversion.service';

import {BankingFixtures} from '../../../scripts/seed-data/banking-fixtures';
import {SESSION_TEST_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_EMAIL} from '../../../scripts/seed-data/seed.constants';
import {getApp} from '../../setup/e2e.setup';

// Synthetic reference rates (units of currency per 1 EUR).
const SYNTHETIC_RATES: Readonly<Record<string, string>> = {GBP: '0.800000', USD: '1.250000', RON: '5.000000'};
// Wednesday 2026-09-09, 17:00 in Berlin: that day's ECB rates should already be published.
const NOW = new Date('2026-09-09T15:00:00.000Z');

describe('BankTransactionAmountConversionService', () => {
	let app: INestApplication;
	let fixtures: BankingFixtures;
	let fxRates: Repository<BankTransactionFxRate>;
	let accounts: Repository<Account>;
	let owner: Account;
	let otherOwner: Account;
	let service: BankTransactionAmountConversionService;
	let fetchSpy: jest.SpyInstance;
	let ecbRequests: Array<{currency: string; from: string; to: string}>;

	beforeAll(async () => {
		app = getApp();
		fixtures = new BankingFixtures(app);
		fxRates = app.get(getRepositoryToken(BankTransactionFxRate));
		accounts = app.get(getRepositoryToken(Account));
		service = app.get(BankTransactionAmountConversionService);
		const accountService = app.get(AccountService);
		owner = (await accountService.findByEmail(VERIFIED_ACCOUNT_EMAIL))!;
		otherOwner = (await accountService.findByEmail(SESSION_TEST_ACCOUNT_EMAIL))!;
	});

	beforeEach(async () => {
		await fixtures.connections.createQueryBuilder().delete().execute();
		await fxRates.clear();
		await accounts.createQueryBuilder().update().set({baseCurrency: null}).execute();
		ecbRequests = [];
		fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = new URL(String(input));
			const currency = url.pathname.split('/').at(-1)!.split('.')[1];
			const from = url.searchParams.get('startPeriod')!;
			const to = url.searchParams.get('endPeriod')!;
			ecbRequests.push({currency, from, to});
			return new Response(syntheticEcbCsv(currency, from, to), {status: 200});
		});
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	async function createBankAccount(account: Account, currency: string, overrides: Partial<BankAccount> = {}) {
		const connection = await fixtures.createConnection(account);
		return fixtures.createBankAccount(connection, {currency, ...overrides});
	}

	describe('rate refresh for account currencies', () => {
		it('fetches rates since the newest stored one for active foreign-currency accounts', async () => {
			await createBankAccount(owner, 'EUR');
			await createBankAccount(owner, 'USD');
			await fxRates.save({currency: 'USD', rateDate: '2026-09-01', rateToEur: '1.2', provider: 'ECB'});

			await service.backfill(NOW);

			expect(ecbRequests).toEqual([{currency: 'USD', from: '2026-09-01', to: '2026-09-09'}]);
			const latest = await fxRates.findOneByOrFail({currency: 'USD', rateDate: '2026-09-09'});
			expect(latest.rateToEur).toBe('1.250000000000');
		});

		it('fetches a recent window for a currency without any stored rate', async () => {
			await createBankAccount(otherOwner, 'GBP');

			await service.backfill(NOW);

			expect(ecbRequests).toEqual([{currency: 'GBP', from: '2026-09-02', to: '2026-09-09'}]);
		});

		it('does not fetch for up-to-date, EUR-only or inactive accounts', async () => {
			await createBankAccount(owner, 'EUR');
			await createBankAccount(owner, 'USD');
			await createBankAccount(owner, 'RON', {isActive: false});
			await fxRates.save({currency: 'USD', rateDate: '2026-09-09', rateToEur: '1.2', provider: 'ECB'});

			await service.backfill(NOW);

			expect(ecbRequests).toEqual([]);
		});
	});
});

function syntheticEcbCsv(currency: string, from: string, to: string): string {
	const rows = ['KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE'];
	const rate = SYNTHETIC_RATES[currency];
	for (let date = new Date(`${from}T00:00:00.000Z`); date <= new Date(`${to}T00:00:00.000Z`);) {
		const weekday = date.getUTCDay();
		if (rate && weekday !== 0 && weekday !== 6) {
			rows.push(
				`EXR.D.${currency}.EUR.SP00.A,D,${currency},EUR,SP00,A,${date.toISOString().slice(0, 10)},${rate}`,
			);
		}
		date.setUTCDate(date.getUTCDate() + 1);
	}
	return `${rows.join('\n')}\n`;
}
