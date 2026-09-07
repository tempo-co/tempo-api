import {UnauthorizedException} from '@nestjs/common';
import {Queue} from 'bullmq';
import Redis from 'ioredis';
import {DataSource} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {EmailService} from '@core/email/email.service';
import {Account} from '@modules/account/account.entity';
import {BankingAuthorizationStateService} from '@modules/banking/services/banking-authorization-state.service';

import {AccountDeletionService} from './account-deletion.service';
import {AccountService} from './account.service';

function buildService() {
	const account = {
		id: 'account-id',
		name: 'Test Account',
		email: 'account@test.com',
		isEmailVerified: true,
		password: 'argon2-hash',
		createdAt: new Date(),
		updatedAt: new Date(),
	} as Account;

	const accountService = {
		findById: jest.fn().mockResolvedValue(account),
		verifyPassword: jest.fn().mockResolvedValue(undefined),
	};
	const sessionKey = 'sess:owned-session';
	const otherKey = 'sess:other-session';
	const redis = {
		scan: jest.fn().mockResolvedValue(['0', [sessionKey, otherKey]]),
		mget: jest
			.fn()
			.mockResolvedValue([
				JSON.stringify({passport: {user: account.id}}),
				JSON.stringify({passport: {user: 'someone-else'}}),
			]),
		del: jest.fn().mockResolvedValue(1),
	};
	const authorizationStateService = {
		removeForAccount: jest.fn().mockResolvedValue(0),
	};
	const transactionManager = {
		delete: jest.fn().mockResolvedValue({affected: 1}),
	};
	const dataSource = {
		transaction: jest.fn(async (callback: (manager: unknown) => Promise<void>) => callback(transactionManager)),
	};
	const emailService = {
		send: jest.fn().mockResolvedValue(undefined),
	};
	const emailQueue = {
		getJobs: jest.fn().mockResolvedValue([]),
	};

	const configService = {
		get: jest.fn((key: string) => (key === 'SESSION_REDIS_KEY' ? 'sess' : 'test-key-prefix')),
	};

	const service = new AccountDeletionService(
		accountService as unknown as AccountService,
		authorizationStateService as unknown as BankingAuthorizationStateService,
		dataSource as unknown as DataSource,
		emailService as unknown as EmailService,
		emailQueue as unknown as Queue,
		redis as unknown as Redis,
		configService as unknown as ConfigurationService,
	);

	return {
		service,
		account,
		accountService,
		redis,
		sessionKey,
		otherKey,
		authorizationStateService,
		transactionManager,
		dataSource,
		emailService,
		emailQueue,
		configService,
	};
}

describe('AccountDeletionService', () => {
	it('rejects with UnauthorizedException when the password confirmation fails', async () => {
		const {service, accountService, redis, dataSource} = buildService();
		accountService.verifyPassword.mockRejectedValue(new UnauthorizedException());

		await expect(service.deleteAccount('account-id', 'wrong-password')).rejects.toThrow(UnauthorizedException);
		expect(redis.del).not.toHaveBeenCalled();
		expect(dataSource.transaction).not.toHaveBeenCalled();
	});

	it('revokes every session of the account from Redis before deleting', async () => {
		const {service, account, redis, sessionKey, otherKey} = buildService();

		await service.deleteAccount(account.id, 'correct-password');

		expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'sess:*', 'COUNT', '250');
		expect(redis.mget).toHaveBeenCalledWith([sessionKey, otherKey]);
		expect(redis.del).toHaveBeenCalledTimes(1);
		expect(redis.del).toHaveBeenCalledWith(sessionKey);
	});

	it('deletes the account row in a transaction and relies on FK cascades for bank data', async () => {
		const {service, account, dataSource, transactionManager} = buildService();

		await service.deleteAccount(account.id, 'correct-password');

		expect(dataSource.transaction).toHaveBeenCalledTimes(1);
		expect(transactionManager.delete).toHaveBeenCalledWith(expect.anything(), {id: account.id});
	});

	it('removes pending bank authorization states owned by the account', async () => {
		const {service, account, authorizationStateService} = buildService();

		await service.deleteAccount(account.id, 'correct-password');

		expect(authorizationStateService.removeForAccount).toHaveBeenCalledWith(account.id);
	});

	it('cancels pending emails for the deleted address without touching other emails', async () => {
		const {service, account, emailQueue} = buildService();
		const ownedJob = {data: {to: account.email}, remove: jest.fn().mockResolvedValue(undefined)};
		const otherJob = {data: {to: 'someone-else@test.com'}, remove: jest.fn().mockResolvedValue(undefined)};
		emailQueue.getJobs.mockResolvedValue([ownedJob, otherJob]);

		await service.deleteAccount(account.id, 'correct-password');

		expect(emailQueue.getJobs).toHaveBeenCalledWith(['waiting', 'delayed']);
		expect(ownedJob.remove).toHaveBeenCalledTimes(1);
		expect(otherJob.remove).not.toHaveBeenCalled();
	});

	it('enqueues the farewell email for the deleted account', async () => {
		const {service, account, emailService} = buildService();

		await service.deleteAccount(account.id, 'correct-password');

		expect(emailService.send).toHaveBeenCalledTimes(1);
		expect(emailService.send).toHaveBeenCalledWith({
			to: account.email,
			subject: 'Your Tempo account has been deleted',
			template: 'account-deleted',
			context: {name: account.name},
		});
	});

	it('succeeds even when post-deletion cleanup fails', async () => {
		const {service, account, redis, authorizationStateService, emailService} = buildService();
		redis.scan.mockRejectedValue(new Error('redis down'));
		authorizationStateService.removeForAccount.mockRejectedValue(new Error('redis down'));
		emailService.send.mockRejectedValue(new Error('queue down'));

		await expect(service.deleteAccount(account.id, 'correct-password')).resolves.toEqual({
			message: 'Account has been deleted.',
		});
	});
});
