import {InjectQueue} from '@nestjs/bullmq';
import {Inject, Injectable, Logger} from '@nestjs/common';
import {Queue} from 'bullmq';
import Redis from 'ioredis';
import {DataSource} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {EmailService} from '@core/email/email.service';
import {EMAIL_QUEUE} from '@core/queue/queue.constants';
import {REDIS} from '@core/redis/redis.constants';
import {SessionService} from '@core/session/session.service';
import {Account} from '@modules/account/account.entity';
import {BankingAuthorizationStateService} from '@modules/banking/services/banking-authorization-state.service';

import {AccountService} from './account.service';

const ACCOUNT_DELETED_EMAIL_SUBJECT = 'Your Tempo account has been deleted';
export {ACCOUNT_DELETED_EMAIL_SUBJECT};
export const ACCOUNT_DELETED_MESSAGE = 'Account has been deleted.';
const SCAN_BATCH_SIZE = '250';

type OwnedRedisKey = {key: string; value: string};

@Injectable()
export class AccountDeletionService {
	private readonly logger = new Logger(AccountDeletionService.name);

	constructor(
		private readonly accountService: AccountService,
		private readonly sessionService: SessionService,
		private readonly authorizationStateService: BankingAuthorizationStateService,
		private readonly dataSource: DataSource,
		private readonly emailService: EmailService,
		@InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
		@Inject(REDIS) private readonly redis: Redis,
		private readonly configService: ConfigurationService,
	) {}

	async deleteAccount(accountId: Account['id'], password: Account['password']) {
		const account = await this.accountService.findById(accountId);
		await this.accountService.verifyPassword(account.password, password);

		// null for the current session id: revoke ALL of the account's sessions,
		// including the caller's own (same primitive the password-reset flow uses).
		await this.sessionService.revokeAllOtherSessions(accountId, null);

		const email = account.email;
		await this.dataSource.transaction(async (manager) => {
			await manager.delete(Account, {id: accountId});
		});

		await this.removeOutstandingTokens(accountId, email);
		try {
			await this.authorizationStateService.removeForAccount(accountId);
		} catch {
			this.logger.warn('Failed to remove pending bank authorization states during account deletion.');
		}
		await this.cancelPendingEmails(email);

		await this.sendFarewellEmail(account);
		return {message: ACCOUNT_DELETED_MESSAGE};
	}

	private async removeOutstandingTokens(accountId: Account['id'], email: Account['email']): Promise<void> {
		for (const {prefix, owns} of this.ownershipMatchers(accountId, email)) {
			await this.deleteOwnedKeys(`${prefix}:*`, owns);
		}
	}

	private ownershipMatchers(accountId: Account['id'], email: Account['email']) {
		return [
			{
				prefix: this.configService.get('EMAIL_VERIFICATION_REDIS_KEY'),
				owns: (value: string) => value === email,
			},
			{
				prefix: this.configService.get('PASSWORD_RESET_REDIS_KEY'),
				owns: (value: string) => value === accountId,
			},
		];
	}

	private async deleteOwnedKeys(
		matchPattern: string,
		owns: (value: string) => Promise<boolean> | boolean,
	): Promise<void> {
		try {
			for (const owned of await this.scanOwnedKeys(matchPattern, owns)) {
				await this.redis.del(owned.key);
			}
		} catch {
			this.logger.warn(`Failed to clean up keys matching "${matchPattern}" during account deletion.`);
		}
	}

	private async scanOwnedKeys(
		matchPattern: string,
		owns: (value: string) => Promise<boolean> | boolean,
	): Promise<OwnedRedisKey[]> {
		const ownedKeys: OwnedRedisKey[] = [];
		let cursor = '0';

		while (true) {
			const reply = await this.redis.scan(cursor, 'MATCH', matchPattern, 'COUNT', SCAN_BATCH_SIZE);
			cursor = reply[0];
			const keys = reply[1];
			if (keys.length > 0) {
				const values = await this.redis.mget(keys);
				for (let i = 0; i < keys.length; i++) {
					const value = values[i];
					if (value && (await owns(value))) ownedKeys.push({key: keys[i], value});
				}
			}
			if (cursor === '0') break;
		}
		return ownedKeys;
	}

	private async cancelPendingEmails(email: Account['email']): Promise<void> {
		try {
			const jobs = await this.emailQueue.getJobs(['waiting', 'delayed']);
			await Promise.all(
				jobs.filter((job) => this.isEmailJobFor(job?.data?.to, email)).map((job) => job.remove()),
			);
		} catch {
			this.logger.warn('Failed to cancel pending emails during account deletion.');
		}
	}

	private isEmailJobFor(to: unknown, email: Account['email']): boolean {
		if (typeof to === 'string') return to.toLowerCase() === email.toLowerCase();
		if (Array.isArray(to)) return to.some((recipient) => this.isEmailJobFor(recipient, email));
		if (to && typeof to === 'object' && 'address' in to) {
			return this.isEmailJobFor((to as {address: unknown}).address, email);
		}
		return false;
	}

	private async sendFarewellEmail(account: Account): Promise<void> {
		try {
			await this.emailService.send({
				to: account.email,
				subject: ACCOUNT_DELETED_EMAIL_SUBJECT,
				template: 'account-deleted',
				context: {name: account.name},
			});
		} catch {
			this.logger.warn('Failed to enqueue the account-deleted email.');
		}
	}
}
