import {BadRequestException, Inject, Injectable} from '@nestjs/common';
import argon2 from 'argon2';
import Redis from 'ioredis';
import ms from 'ms';
import crypto from 'node:crypto';

import {ConfigurationService} from '@core/config/config.service';
import {EmailService} from '@core/email/email.service';
import {REDIS} from '@core/redis/redis.constants';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';

import {
	PASSWORD_RESET_CONFIRMATION,
	PASSWORD_RESET_INVALID_TOKEN,
	PASSWORD_RESET_SUCCESS,
	PASSWORD_SAME_AS_OLD,
} from '../api/constants/api-messages.constants';
import {SessionService} from './session.service';

@Injectable()
export class PasswordResetService {
	private readonly REDIS_KEY;
	private readonly EXPIRATION;
	private readonly WEB_BASE_URL;

	constructor(
		private readonly accountService: AccountService,
		private readonly emailService: EmailService,
		private readonly configService: ConfigurationService,
		@Inject(REDIS) private readonly redisClient: Redis,
		private readonly sessionService: SessionService,
	) {
		this.REDIS_KEY = this.configService.get('PASSWORD_RESET_REDIS_KEY');
		this.WEB_BASE_URL = this.configService.get('WEB_BASE_URL');

		const expirationMs = ms(this.configService.get('PASSWORD_RESET_EXPIRATION'));
		const expirationSeconds = Math.floor(expirationMs / 1000);
		this.EXPIRATION = expirationSeconds;
	}

	async requestPasswordReset(email: Account['email']) {
		const account = await this.accountService.findByEmail(email);
		if (!account) {
			return {message: PASSWORD_RESET_CONFIRMATION};
		}

		const token = await this._createResetToken(account.id);
		const resetUrl = this._createUrl(token, account.email);

		await this.emailService.send({
			to: account.email,
			subject: 'Reset your password',
			template: 'reset-password',
			context: {name: account.name, resetUrl},
		});
		return {message: PASSWORD_RESET_CONFIRMATION};
	}

	async resetPassword(password: Account['password'], token: string) {
		const {accountId, key} = await this._getTokenData(token);

		await this._assertPasswordIsNew(accountId, password, key);

		const hash = await argon2.hash(password);
		await this.accountService.update(accountId, {password: hash});

		await this.redisClient.del(key);
		await this.sessionService.revokeAllOtherSessions(accountId, null);

		return {message: PASSWORD_RESET_SUCCESS};
	}

	private async _createResetToken(accountId: Account['id']) {
		const token: string = crypto.randomUUID();
		const key = `${this.REDIS_KEY}:${token}`;

		await this.redisClient.set(key, accountId, 'EX', this.EXPIRATION);
		return token;
	}

	private _createUrl(token: string, email: Account['email']) {
		const url = new URL('/reset-password', this.WEB_BASE_URL);
		url.search = new URLSearchParams({token, email}).toString();
		return url.toString();
	}

	private async _getTokenData(token: string) {
		const key = `${this.REDIS_KEY}:${token}`;

		const accountId = await this.redisClient.get(key);
		if (!accountId) {
			throw new BadRequestException(PASSWORD_RESET_INVALID_TOKEN);
		}
		return {accountId, key};
	}

	private async _assertPasswordIsNew(accountId: Account['id'], newPassword: string, key: string) {
		const account = await this.accountService.findById(accountId);

		const isSamePassword = await argon2.verify(account.password, newPassword);
		if (isSamePassword) {
			await this.redisClient.del(key);
			throw new BadRequestException(PASSWORD_SAME_AS_OLD);
		}
	}
}
