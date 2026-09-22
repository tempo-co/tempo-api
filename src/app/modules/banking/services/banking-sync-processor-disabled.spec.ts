import {Job} from 'bullmq';
import {Repository} from 'typeorm';

import {DISPATCH_BANK_CONNECTION_SYNCS_JOB} from '@core/queue/queue.constants';

import {BankConnection} from '../bank-connection.entity';
import {BankingSyncProcessor} from './banking-sync.processor';

it('does not consume banking jobs when integration is disabled', async () => {
	const dispatchDueConnections = jest.fn();
	const findOne = jest.fn();
	const synchronizeAutomatically = jest.fn();
	const processor = new BankingSyncProcessor(
		{findOne} as unknown as Repository<BankConnection>,
		{synchronizeAutomatically} as never,
		{isIntegrationEnabled: jest.fn(() => false), dispatchDueConnections} as never,
	);

	await processor.process({name: DISPATCH_BANK_CONNECTION_SYNCS_JOB, data: {}} as Job);
	await processor.process({name: 'sync-bank-connection', data: {connectionId: 'connection-id'}} as Job);

	expect(dispatchDueConnections).not.toHaveBeenCalled();
	expect(findOne).not.toHaveBeenCalled();
	expect(synchronizeAutomatically).not.toHaveBeenCalled();
});
