import {Queue} from 'bullmq';
import {Repository} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {BANK_CONNECTION_SYNC_SCHEDULER_ID} from '@core/queue/queue.constants';

import {BankConnection} from '../bank-connection.entity';
import {BankingSyncQueueService} from './banking-sync-queue.service';

it('does not schedule or enqueue banking work when integration is disabled', async () => {
	const queue = {
		upsertJobScheduler: jest.fn(),
		removeJobScheduler: jest.fn().mockResolvedValue(false),
		add: jest.fn(),
		getJob: jest.fn(),
	};
	const repository = {
		createQueryBuilder: jest.fn(),
	};
	const configurationService = {
		get: jest.fn((key: string) => {
			if (key === 'BANKING_INTEGRATION_ENABLED') return false;
			if (key === 'NODE_ENV') return 'production';
			return '10m';
		}),
	};
	const service = new BankingSyncQueueService(
		repository as unknown as Repository<BankConnection>,
		queue as unknown as Queue,
		configurationService as unknown as ConfigurationService,
		{} as never,
	);

	await service.onModuleInit();
	await service.enqueueInitialSync('connection-id');
	await expect(service.dispatchDueConnections()).resolves.toBe(0);

	expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
	expect(queue.removeJobScheduler).toHaveBeenCalledWith(BANK_CONNECTION_SYNC_SCHEDULER_ID);
	expect(queue.add).not.toHaveBeenCalled();
	expect(repository.createQueryBuilder).not.toHaveBeenCalled();
});

it('fails closed when a disabled banking scheduler cannot be removed', async () => {
	const queue = {
		upsertJobScheduler: jest.fn(),
		removeJobScheduler: jest.fn().mockRejectedValue(new Error('redis unavailable')),
		add: jest.fn(),
		getJob: jest.fn(),
	};
	const service = new BankingSyncQueueService(
		{} as Repository<BankConnection>,
		queue as unknown as Queue,
		{
			get: jest.fn((key: string) => {
				if (key === 'BANKING_INTEGRATION_ENABLED') return false;
				if (key === 'NODE_ENV') return 'production';
				return '10m';
			}),
		} as unknown as ConfigurationService,
		{} as never,
	);

	await expect(service.onModuleInit()).rejects.toThrow('redis unavailable');
});
