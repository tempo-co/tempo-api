import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import TestAgent from 'supertest/lib/agent';
import {DeepPartial, Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';
import {BANKING_TRANSACTION_SUMMARY_FUTURE_MONTH} from '@modules/banking/api/constants/banking-messages.constants';
import {BankAccount} from '@modules/banking/bank-account.entity';
import {
	BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION,
	BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES,
	BANK_TRANSACTION_FINANCIAL_EVENT_TYPES,
} from '@modules/banking/bank-transaction-financial-event';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';
import {formatCents, parseCents} from '@modules/banking/summary/bank-transaction-summary';

import {BankingFixtures} from '../../../scripts/seed-data/banking-fixtures';
import {
	SESSION_TEST_ACCOUNT_EMAIL,
	SESSION_TEST_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../../scripts/seed-data/seed.constants';
import {getApp, loginAgent} from '../../setup/e2e.setup';

const SUMMARY = '/bank-transactions/summary';
const OCTOBER = {month: '2026-10', asOf: '2026-10-18'};

/** A categorized, booked debit in EUR unless overridden. */
function row(bookingDate: string | null, amount: string, overrides: DeepPartial<BankTransaction> = {}) {
	return {
		bookingDate,
		valueDate: bookingDate,
		amount,
		amountInBaseCurrency: amount,
		creditDebitIndicator: amount.startsWith('-') ? 'DBIT' : 'CRDT',
		category: 'SHOPPING',
		categoryStatus: 'COMPLETED',
		categorySource: 'AI',
		...overrides,
	} satisfies DeepPartial<BankTransaction>;
}

describe('BankTransactionSummary', () => {
	let app: INestApplication;
	let fixtures: BankingFixtures;
	let accounts: Repository<Account>;
	let owner: Account;
	let otherOwner: Account;
	let ownerAgent: TestAgent;
	let otherAgent: TestAgent;
	let ownerBankAccount: BankAccount;
	let otherBankAccount: BankAccount;

	async function removeConnections() {
		await fixtures.connections
			.createQueryBuilder()
			.delete()
			.where('accountId IN (:...accountIds)', {accountIds: [owner.id, otherOwner.id]})
			.execute();
	}

	beforeAll(async () => {
		app = getApp();
		fixtures = new BankingFixtures(app);
		accounts = app.get(getRepositoryToken(Account));
		const accountService = app.get(AccountService);
		owner = (await accountService.findByEmail(VERIFIED_ACCOUNT_EMAIL))!;
		otherOwner = (await accountService.findByEmail(SESSION_TEST_ACCOUNT_EMAIL))!;
		ownerAgent = await loginAgent(app.getHttpServer(), VERIFIED_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_PASSWORD);
		otherAgent = await loginAgent(app.getHttpServer(), SESSION_TEST_ACCOUNT_EMAIL, SESSION_TEST_ACCOUNT_PASSWORD);

		await removeConnections();
		await accounts.update({id: owner.id}, {baseCurrency: 'EUR'});
		await accounts.update({id: otherOwner.id}, {baseCurrency: null});
		ownerBankAccount = await fixtures.createBankAccount(await fixtures.createConnection(owner));
		const ownerGbpAccount = await fixtures.createBankAccount(await fixtures.createConnection(owner), {
			currency: 'GBP',
		});
		otherBankAccount = await fixtures.createBankAccount(await fixtures.createConnection(otherOwner));
		const exchange = {
			category: null,
			categoryStatus: 'NOT_APPLICABLE',
			financialEventType: BANK_TRANSACTION_FINANCIAL_EVENT_TYPES.CURRENCY_EXCHANGE,
			financialEventSource: BANK_TRANSACTION_FINANCIAL_EVENT_SOURCES.RULE,
			financialEventRuleVersion: BANK_TRANSACTION_FINANCIAL_EVENT_RULE_VERSION,
		};

		await fixtures.createTransactions(ownerBankAccount, [
			// Baseline months.
			row('2026-07-05', '-20.00', {category: 'FOOD_AND_DRINK'}),
			row('2026-07-10', '1000.00', {category: 'INCOME'}),
			row('2026-07-20', '-100.00', {category: 'FOOD_AND_DRINK'}),
			row('2026-08-18', '-30.00', {category: 'FOOD_AND_DRINK'}),
			row('2026-08-31', '-300.00'),
			row('2026-09-01', '-60.00', {category: 'TRANSFER_OUT'}),
			row('2026-09-30', '-15.00', {category: 'FOOD_AND_DRINK'}),
			// Viewed month.
			row('2026-10-01', '-12.30', {category: 'FOOD_AND_DRINK'}),
			row('2026-10-03', '-7.70', {category: 'FOOD_AND_DRINK'}),
			row('2026-10-05', '-50.00', {category: 'TRANSFER_OUT'}),
			row('2026-10-06', '5.00', {category: 'REFUND'}),
			row('2026-10-07', '-3.00', {category: null}),
			row('2026-10-08', '2000.00', {category: 'INCOME'}),
			row('2026-10-09', '-100.00', {category: null, ownTransferEvidence: 'IBAN'}),
			row('2026-10-09', '100.00', {category: null, ownTransferEvidence: 'IBAN'}),
			row('2026-10-10', '-40.00', exchange),
			row('2026-10-11', '-1.00', {creditDebitIndicator: null}),
			row('2026-10-12', '-9.99', {amountInBaseCurrency: null}),
			// After the cut-off day, and not booked yet.
			row('2026-10-19', '-1000.00', {category: 'FOOD_AND_DRINK'}),
			row(null, '-20.00', {transactionStatus: 'PDNG'}),
		]);
		await fixtures.createTransactions(ownerGbpAccount, [
			row('2026-10-02', '-10.00', {currency: 'GBP', amountInBaseCurrency: '-11.60', category: 'FOOD_AND_DRINK'}),
		]);
		await fixtures.createTransactions(otherBankAccount, [
			row('2026-09-10', '-40.00', {category: 'FOOD_AND_DRINK'}),
			row('2026-10-02', '-999.00', {category: 'FOOD_AND_DRINK'}),
		]);
	});

	afterAll(async () => {
		await removeConnections();
	});

	it('summarizes spending, income and pace for a month against the three before it', async () => {
		const response = await ownerAgent.get(SUMMARY).query(OCTOBER).expect(200);
		const body = response.body;

		expect(body).toMatchObject({
			month: '2026-10',
			through: '2026-10-18',
			daysInMonth: 31,
			baseCurrency: 'EUR',
			totals: {spending: '79.60', income: '2000.00', net: '1920.40', ownTransfers: '100.00'},
			excluded: {unknownDirection: 1, missingBaseAmount: 1},
		});
		expect(body.daily).toHaveLength(18);
		expect(body.daily.slice(0, 7)).toEqual([
			{day: 1, spending: '12.30', cumulative: '12.30'},
			{day: 2, spending: '11.60', cumulative: '23.90'},
			{day: 3, spending: '7.70', cumulative: '31.60'},
			{day: 4, spending: '0.00', cumulative: '31.60'},
			{day: 5, spending: '50.00', cumulative: '81.60'},
			{day: 6, spending: '-5.00', cumulative: '76.60'},
			{day: 7, spending: '3.00', cumulative: '79.60'},
		]);
		expect(body.daily[17]).toEqual({day: 18, spending: '0.00', cumulative: '79.60'});

		expect(body.baseline).toMatchObject({
			months: ['2026-07', '2026-08', '2026-09'],
			spendingByThrough: '36.67',
			incomeByThrough: '333.33',
		});
		expect(body.baseline.daily).toHaveLength(31);
		expect(body.baseline.daily[17]).toEqual({day: 18, average: '36.67', low: '20.00', high: '60.00'});
		// September stops at day 30.
		expect(body.baseline.daily[30]).toEqual({day: 31, average: '175.00', low: '75.00', high: '330.00'});

		expect(body.categories).toEqual([
			{category: 'TRANSFER_OUT', spending: '50.00', count: 1, baselineAverage: '20.00'},
			{category: 'FOOD_AND_DRINK', spending: '31.60', count: 3, baselineAverage: '16.67'},
			{category: 'UNCATEGORIZED', spending: '3.00', count: 1, baselineAverage: null},
			{category: 'REFUND', spending: '-5.00', count: 1, baselineAverage: null},
		]);
	});

	/** Sums the list filtered the way a dashboard drill link does, in cents, as the summary signs it. */
	async function listed(
		cashFlow: 'SPENDING' | 'INCOME',
		from: string,
		to: string,
		filter: Record<string, string> = {},
	) {
		const {body} = await ownerAgent
			.get('/bank-transactions')
			.query({
				'filter[cashFlows][]': cashFlow,
				'filter[baseAmount]': 'PRESENT',
				'filter[bookingDate][from]': from,
				'filter[bookingDate][to]': to,
				'pagination[pageSize]': '100',
				...filter,
			})
			.expect(200);
		const cents = body.transactions.reduce(
			(total: bigint, {amountInBaseCurrency}: {amountInBaseCurrency: string}) =>
				total + parseCents(amountInBaseCurrency),
			0n,
		);
		return {amount: formatCents(cashFlow === 'SPENDING' ? -cents : cents), count: body.total};
	}

	async function expectCategoriesReconcile(
		summary: {through: string; categories: Array<Record<string, unknown>>},
		from: string,
	) {
		for (const {category, spending, count} of summary.categories) {
			expect(await listed('SPENDING', from, summary.through, {'filter[categories][]': String(category)})).toEqual(
				{
					amount: spending,
					count,
				},
			);
		}
	}

	it('reconciles totals and categories with the filtered transaction list', async () => {
		const {body: summary} = await ownerAgent.get(SUMMARY).query(OCTOBER).expect(200);
		const from = '2026-10-01';

		expect((await listed('SPENDING', from, summary.through)).amount).toBe(summary.totals.spending);
		expect((await listed('INCOME', from, summary.through)).amount).toBe(summary.totals.income);
		await expectCategoriesReconcile(summary, from);
	});

	it('keys review, refund debits and lowercase indicators like the list on the first of a month', async () => {
		const extra = await fixtures.createTransactions(ownerBankAccount, [
			row('2026-11-01', '-4.00', {category: 'NEEDS_REVIEW'}),
			row('2026-11-01', '-2.00', {category: 'REFUND'}),
			row('2026-11-01', '-1.50', {creditDebitIndicator: 'dbit'}),
			row('2026-11-01', '10.00', {creditDebitIndicator: 'crdt', category: 'INCOME'}),
			row('2026-11-02', '-99.00'),
		]);

		try {
			const {body: summary} = await ownerAgent
				.get(SUMMARY)
				.query({month: '2026-11', asOf: '2026-11-01'})
				.expect(200);

			expect(summary).toMatchObject({
				through: '2026-11-01',
				totals: {spending: '7.50', income: '10.00', net: '2.50'},
				baseline: {months: ['2026-08', '2026-09', '2026-10']},
			});
			expect(summary.daily).toEqual([{day: 1, spending: '7.50', cumulative: '7.50'}]);
			expect(summary.categories).toEqual([
				{category: 'NEEDS_REVIEW', spending: '4.00', count: 1, baselineAverage: null},
				{category: 'SHOPPING', spending: '1.50', count: 1, baselineAverage: '0.00'},
				{category: 'REFUND', spending: '2.00', count: 1, baselineAverage: null},
			]);
			expect((await listed('INCOME', '2026-11-01', summary.through)).amount).toBe('10.00');
			await expectCategoriesReconcile(summary, '2026-11-01');
		} finally {
			await fixtures.transactions.delete(extra.map(({id}) => id));
		}
	});

	it('uses only months with history, and leaves out another owner’s rows', async () => {
		const {body} = await otherAgent.get(SUMMARY).query(OCTOBER).expect(200);

		expect(body.totals.spending).toBe('999.00');
		expect(body.baseline.months).toEqual(['2026-09']);
		expect(body.baseline.daily[17]).toEqual({day: 18, average: '40.00', low: null, high: null});
		expect(body.categories).toEqual([
			{category: 'FOOD_AND_DRINK', spending: '999.00', count: 1, baselineAverage: '40.00'},
		]);
	});

	it('summarizes a past month through its last day', async () => {
		const {body} = await ownerAgent.get(SUMMARY).query({month: '2026-09', asOf: '2026-10-18'}).expect(200);

		expect(body).toMatchObject({through: '2026-09-30', daysInMonth: 30, totals: {spending: '75.00'}});
		expect(body.daily).toHaveLength(30);
		expect(body.baseline.months).toEqual(['2026-07', '2026-08']);
	});

	it('compares with nothing before the first booked transaction', async () => {
		const {body} = await ownerAgent.get(SUMMARY).query({month: '2026-07', asOf: '2026-10-18'}).expect(200);

		expect(body.baseline).toEqual({months: [], daily: [], spendingByThrough: null, incomeByThrough: null});
		expect(body.categories).toEqual([
			{category: 'FOOD_AND_DRINK', spending: '120.00', count: 2, baselineAverage: null},
		]);
	});

	it.each([
		['a missing month', {asOf: '2026-10-18'}],
		['a month out of range', {month: '2026-13', asOf: '2026-10-18'}],
		['a malformed month', {month: '2026-1', asOf: '2026-10-18'}],
		['a two-digit year', {month: '0050-04', asOf: '2026-10-18'}],
		['a missing day', {month: '2026-10'}],
		['an impossible day', {month: '2026-10', asOf: '2026-02-30'}],
		['a month after the given day', {month: '2026-11', asOf: '2026-10-18'}],
	])('rejects %s', async (_case, query) => {
		await ownerAgent.get(SUMMARY).query(query).expect(400);
	});

	it('explains why a month after the given day is rejected', async () => {
		const {body} = await ownerAgent.get(SUMMARY).query({month: '2026-11', asOf: '2026-10-31'}).expect(400);
		expect(body.message).toBe(BANKING_TRANSACTION_SUMMARY_FUTURE_MONTH);
	});

	it('counts transactions that need attention across all months', async () => {
		const extra = await fixtures.createTransactions(ownerBankAccount, [
			row('2026-07-15', '-5.00', {category: 'NEEDS_REVIEW'}),
			row(null, '-6.00', {category: null, categoryStatus: 'FAILED', amountInBaseCurrency: null}),
			row('2026-08-03', '-7.00', {category: null, categoryStatus: 'PROCESSING'}),
		]);
		const otherExtra = await fixtures.createTransaction(
			otherBankAccount,
			row('2026-08-03', '-8.00', {category: 'NEEDS_REVIEW'}),
		);

		try {
			const {body} = await ownerAgent.get('/bank-transactions/review-counts').expect(200);
			expect(body).toEqual({
				needsReview: 1,
				categorizationFailed: 1,
				categorizing: 1,
				unknownDirection: 1,
				missingBaseAmount: 2,
			});

			// Each count opens a list with exactly that many rows.
			const listTotal = async (filter: Record<string, string | string[]>) =>
				(await ownerAgent.get('/bank-transactions').query(filter).expect(200)).body.total;
			expect({
				needsReview: await listTotal({'filter[categories][]': 'NEEDS_REVIEW'}),
				categorizationFailed: await listTotal({'filter[categoryStatuses][]': 'FAILED'}),
				categorizing: await listTotal({'filter[categoryStatuses][]': 'CATEGORIZING'}),
				unknownDirection: await listTotal({'filter[cashFlows][]': 'UNKNOWN'}),
				missingBaseAmount: await listTotal({
					'filter[baseAmount]': 'MISSING',
					'filter[cashFlows][]': ['SPENDING', 'INCOME', 'UNKNOWN'],
				}),
			}).toEqual(body);
		} finally {
			await fixtures.transactions.delete([...extra.map(({id}) => id), otherExtra.id]);
		}
	});
});
