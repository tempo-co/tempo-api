import {Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {BankAccount} from '../bank-account.entity';
import {BankTransaction} from '../bank-transaction.entity';
import {BankTransactionAmountConversionService} from './bank-transaction-amount-conversion.service';
import {FxRateService} from './fx-rate.service';

describe('BankTransactionAmountConversionService', () => {
	const createBankAccountQueryBuilder = (currency: string) => ({
		innerJoin: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		select: jest.fn().mockReturnThis(),
		addSelect: jest.fn().mockReturnThis(),
		groupBy: jest.fn().mockReturnThis(),
		orderBy: jest.fn().mockReturnThis(),
		addOrderBy: jest.fn().mockReturnThis(),
		getRawOne: jest.fn().mockResolvedValue({currency}),
	});

	const createService = (transactions: BankTransaction[], baseCurrency = 'EUR') => {
		const account = transactions[0].bankAccount.bankConnection.account;
		const bankAccountQueryBuilder = createBankAccountQueryBuilder(baseCurrency);
		const accountRepository = {update: jest.fn().mockResolvedValue(undefined)} as unknown as Repository<Account>;
		const bankAccountRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(bankAccountQueryBuilder),
		} as unknown as Repository<BankAccount>;
		const bankTransactionRepository = {
			find: jest.fn().mockResolvedValue(transactions),
			update: jest.fn().mockResolvedValue(undefined),
		} as unknown as Repository<BankTransaction>;
		const fxRateService = {
			ensureRates: jest.fn().mockResolvedValue(undefined),
			getRateToEur: jest.fn().mockImplementation(async (currency: string) => (currency === 'GBP' ? 0.85 : 1)),
		} as unknown as FxRateService;
		return {
			account,
			accountRepository,
			bankAccountRepository,
			bankTransactionRepository,
			fxRateService,
			service: new BankTransactionAmountConversionService(
				accountRepository,
				bankAccountRepository,
				bankTransactionRepository,
				fxRateService,
			),
		};
	};

	it('selects and persists the account base currency, then prefers provider data', async () => {
		const account = {id: 'account-id', baseCurrency: null} as Account;
		const transaction = {
			id: 'transaction-id',
			amount: '-100',
			currency: 'RON',
			instructedAmount: '20',
			instructedCurrency: 'EUR',
			transactionDate: null,
			bookingDate: '2026-08-26',
			bankAccount: {bankConnection: {account}},
		} as BankTransaction;
		const {accountRepository, bankTransactionRepository, fxRateService, service} = createService([transaction]);

		await expect(service.backfill()).resolves.toEqual({scanned: 1, converted: 1});
		expect(accountRepository.update).toHaveBeenCalledWith({id: 'account-id'}, {baseCurrency: 'EUR'});
		expect(bankTransactionRepository.update).toHaveBeenCalledWith(
			{id: 'transaction-id'},
			{amountInBaseCurrency: '-20'},
		);
		expect(fxRateService.ensureRates).not.toHaveBeenCalled();
	});

	it('requests historical rates using transactionDate before bookingDate', async () => {
		const account = {id: 'account-id', baseCurrency: null} as Account;
		const transaction = {
			id: 'transaction-id',
			amount: '100',
			currency: 'GBP',
			instructedAmount: null,
			instructedCurrency: null,
			exchangeRate: null,
			exchangeRateUnitCurrency: null,
			transactionDate: '2026-08-24',
			bookingDate: '2026-08-26',
			bankAccount: {bankConnection: {account}},
		} as BankTransaction;
		const {bankTransactionRepository, fxRateService, service} = createService([transaction]);

		await expect(service.backfill()).resolves.toEqual({scanned: 1, converted: 1});
		expect(fxRateService.ensureRates).toHaveBeenCalledWith(new Set(['GBP']), '2026-08-24', '2026-08-24');
		expect(fxRateService.getRateToEur).toHaveBeenNthCalledWith(1, 'GBP', '2026-08-24');
		expect(fxRateService.getRateToEur).toHaveBeenNthCalledWith(2, 'EUR', '2026-08-24');
		expect(bankTransactionRepository.update).toHaveBeenCalledWith(
			{id: 'transaction-id'},
			{amountInBaseCurrency: '117.647058823529'},
		);
	});
});
