import {Queue} from 'bullmq';

import {SEND_EMAIL_JOB} from '@core/queue/queue.constants';

import {EmailService} from './email.service';

describe('EmailService', () => {
	it('tags queued email jobs with their account ID', async () => {
		const emailQueue = {add: jest.fn().mockResolvedValue(undefined)};
		const service = new EmailService(emailQueue as unknown as Queue);

		await service.send({to: 'account@test.com', subject: 'Subject'}, 'account-id');

		expect(emailQueue.add).toHaveBeenCalledWith(SEND_EMAIL_JOB, {
			to: 'account@test.com',
			subject: 'Subject',
			accountId: 'account-id',
		});
	});

	it('cancels only pending jobs for the requested account', async () => {
		const ownedJob = {data: {accountId: 'account-id'}, remove: jest.fn().mockResolvedValue(undefined)};
		const otherJob = {data: {accountId: 'other-account'}, remove: jest.fn().mockResolvedValue(undefined)};
		const emailQueue = {
			add: jest.fn(),
			getJobs: jest.fn().mockResolvedValue([ownedJob, otherJob]),
		};
		const service = new EmailService(emailQueue as unknown as Queue);

		await service.cancelPendingForAccount('account-id');

		expect(emailQueue.getJobs).toHaveBeenCalledWith(['waiting', 'delayed']);
		expect(ownedJob.remove).toHaveBeenCalledTimes(1);
		expect(otherJob.remove).not.toHaveBeenCalled();
	});
});
