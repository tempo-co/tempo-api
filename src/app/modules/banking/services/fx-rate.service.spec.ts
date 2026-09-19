import {Repository} from 'typeorm';

import {BankTransactionFxRate} from '../bank-transaction-fx-rate.entity';
import {FxRateService} from './fx-rate.service';

describe('FxRateService', () => {
	const createQueryBuilder = (rawResult: unknown, entityResult: BankTransactionFxRate | null = null) => {
		const queryBuilder = {
			select: jest.fn().mockReturnThis(),
			addSelect: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			orderBy: jest.fn().mockReturnThis(),
			getRawOne: jest.fn().mockResolvedValue(rawResult),
			getOne: jest.fn().mockResolvedValue(entityResult),
		};
		return queryBuilder;
	};

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('fetches and persists ECB daily rates for uncovered ranges', async () => {
		const queryBuilder = createQueryBuilder({minimumDate: null, maximumDate: null});
		const repository = {
			createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
			upsert: jest.fn().mockResolvedValue(undefined),
		} as unknown as Repository<BankTransactionFxRate>;
		const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			text: async () =>
				'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE\n' +
				'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-08-24,1.1664\n' +
				'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-08-25,1.1662\n',
		} as Response);
		const service = new FxRateService(repository);

		await service.ensureRates(['EUR', 'usd'], '2026-08-24', '2026-08-25');

		expect(fetchMock).toHaveBeenCalledWith(
			'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2026-08-24&endPeriod=2026-08-25&format=csvdata',
			expect.objectContaining({headers: {Accept: 'text/csv'}}),
		);
		expect(repository.upsert).toHaveBeenCalledWith(
			[
				{currency: 'USD', rateDate: '2026-08-24', rateToEur: '1.1664', provider: 'ECB'},
				{currency: 'USD', rateDate: '2026-08-25', rateToEur: '1.1662', provider: 'ECB'},
			],
			['currency', 'rateDate'],
		);
	});

	it('uses the latest cached rate on or before the transaction date', async () => {
		const rate = {rateToEur: '1.1662'} as BankTransactionFxRate;
		const queryBuilder = createQueryBuilder(undefined, rate);
		const repository = {
			createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
		} as unknown as Repository<BankTransactionFxRate>;
		const service = new FxRateService(repository);

		expect(await service.getRateToEur('usd', '2026-08-26')).toBe(1.1662);
		expect(queryBuilder.andWhere).toHaveBeenCalledWith('fxRate.rateDate <= :rateDate', {
			rateDate: '2026-08-26',
		});
	});
});
