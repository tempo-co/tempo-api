import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import {DataSource, Repository} from 'typeorm';

import {StoreBankTransactionBaseAmountProvenance20261003200000} from '@core/database/migrations/20261003200000-store-bank-transaction-base-amount-provenance';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';

import {BankingFixtures} from '../../../scripts/seed-data/banking-fixtures';
import {VERIFIED_ACCOUNT_EMAIL} from '../../../scripts/seed-data/seed.constants';
import {getApp} from '../../setup/e2e.setup';

describe('StoreBankTransactionBaseAmountProvenance migration', () => {
	let app: INestApplication;
	let dataSource: DataSource;
	let fixtures: BankingFixtures;
	let owner: Account;
	const migration = new StoreBankTransactionBaseAmountProvenance20261003200000();

	beforeAll(async () => {
		app = getApp();
		dataSource = app.get(DataSource);
		fixtures = new BankingFixtures(app);
		owner = (await app.get(AccountService).findByEmail(VERIFIED_ACCOUNT_EMAIL))!;
		await app.get<Repository<Account>>(getRepositoryToken(Account)).update({id: owner.id}, {baseCurrency: 'EUR'});
	});

	async function columns(): Promise<Record<string, string>> {
		const rows = (await dataSource.query(
			`SELECT column_name, COALESCE(numeric_scale::text, data_type) AS "shape"
			FROM information_schema.columns
			WHERE table_name = 'bank_transactions'
				AND column_name IN ('amountInBaseCurrency', 'baseAmountMethod', 'baseAmountRateDate')`,
		)) as Array<{column_name: string; shape: string}>;
		return Object.fromEntries(rows.map((row) => [row.column_name, row.shape]));
	}

	it('rounds base-currency rows, clears foreign rows for reconversion, and reverts the schema', async () => {
		const queryRunner = dataSource.createQueryRunner();
		try {
			await migration.down(queryRunner);
			expect(await columns()).toEqual({amountInBaseCurrency: '12'});

			const bankAccount = await fixtures.createBankAccount(await fixtures.createConnection(owner), {
				currency: 'GBP',
			});
			const legacyRows = [
				{currency: 'eur', amount: '-12.345', amountInBaseCurrency: '-12.345000000000'},
				{currency: 'GBP', amount: '-10.00', amountInBaseCurrency: '-11.764705882353'},
				{currency: 'GBP', amount: '-5.00', amountInBaseCurrency: null},
			];
			const ids: string[] = [];
			for (const row of legacyRows) {
				const [{id}] = (await dataSource.query(
					`INSERT INTO "bank_transactions"
						("bankAccountId", "dedupeKey", "stableIdentityKey", "stableIdentityGroupKey", "amount", "currency",
						"amountInBaseCurrency", "creditDebitIndicator", "transactionStatus", "bookingDate", "displayDescription")
					VALUES ($1, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, $2, $3, $4,
						'DBIT', 'BOOK', '2026-09-04', 'Synthetic payment')
					RETURNING "id"`,
					[bankAccount.id, row.amount, row.currency, row.amountInBaseCurrency],
				)) as Array<{id: string}>;
				ids.push(id);
			}

			await migration.up(queryRunner);

			expect(await columns()).toEqual({
				amountInBaseCurrency: '2',
				baseAmountMethod: 'character varying',
				baseAmountRateDate: 'date',
			});
			const stored = (await dataSource.query(
				`SELECT "id", "amountInBaseCurrency", "baseAmountMethod", "baseAmountRateDate"
				FROM "bank_transactions" WHERE "id" = ANY($1)`,
				[ids],
			)) as Array<{id: string}>;
			expect(ids.map((id) => stored.find((row) => row.id === id))).toEqual([
				{id: ids[0], amountInBaseCurrency: '-12.35', baseAmountMethod: 'SAME', baseAmountRateDate: null},
				{id: ids[1], amountInBaseCurrency: null, baseAmountMethod: null, baseAmountRateDate: null},
				{id: ids[2], amountInBaseCurrency: null, baseAmountMethod: null, baseAmountRateDate: null},
			]);

			// Re-running is a no-op for rows the migration already handled.
			await migration.up(queryRunner);
			expect(await columns()).toEqual({
				amountInBaseCurrency: '2',
				baseAmountMethod: 'character varying',
				baseAmountRateDate: 'date',
			});
		} finally {
			await queryRunner.release();
		}
	});
});
