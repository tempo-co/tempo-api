import {BankTransactionAmountConversionQueueService} from './bank-transaction-amount-conversion.queue.service';

describe('BankTransactionAmountConversionQueueService', () => {
	const configurationService = {get: jest.fn().mockReturnValue('production')};

	it('re-enqueues a failed one-time backfill and keeps the scheduler idempotent', async () => {
		const remove = jest.fn();
		const queue = {
			getJob: jest.fn().mockResolvedValue({getState: jest.fn().mockResolvedValue('failed'), remove}),
			add: jest.fn(),
			upsertJobScheduler: jest.fn(),
		};

		await new BankTransactionAmountConversionQueueService(
			queue as never,
			configurationService as never,
		).onModuleInit();

		expect(remove).toHaveBeenCalledTimes(1);
		expect(queue.add).toHaveBeenCalledTimes(1);
		expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
	});

	it('does not enqueue a completed one-time backfill again', async () => {
		const queue = {
			getJob: jest
				.fn()
				.mockResolvedValue({getState: jest.fn().mockResolvedValue('completed'), remove: jest.fn()}),
			add: jest.fn(),
			upsertJobScheduler: jest.fn(),
		};

		await new BankTransactionAmountConversionQueueService(
			queue as never,
			configurationService as never,
		).onModuleInit();

		expect(queue.add).not.toHaveBeenCalled();
		expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
	});
});
