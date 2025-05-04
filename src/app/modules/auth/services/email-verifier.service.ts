import {BadRequestException, Injectable} from '@nestjs/common';
import {Inject} from '@nestjs/common';
import Redis from 'ioredis';
import ms from 'ms';

import {ConfigurationService} from '@core/config/config.service';
import {EmailService} from '@core/email/email.service';
import {REDIS} from '@core/redis/redis.constants';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';

import {EmailChangeDto} from '../api/dtos/email-change.dto';

@Injectable()
export class EmailVerifierService {
	private readonly EXPIRATION: number;
	private readonly REDIS_KEY: string;
	private readonly WEB_BASE_URL: string;

	constructor(
		@Inject(REDIS) private readonly redisClient: Redis,
		private readonly configService: ConfigurationService,
		private readonly emailService: EmailService,
		private readonly accountService: AccountService,
	) {
		this.REDIS_KEY = this.configService.get('EMAIL_VERIFICATION_REDIS_KEY');
		this.WEB_BASE_URL = this.configService.get('WEB_BASE_URL');

		const expirationMs = ms(this.configService.get('EMAIL_VERIFICATION_EXPIRATION'));
		const expirationSeconds = Math.floor(expirationMs / 1000);
		this.EXPIRATION = expirationSeconds;
	}

	async verify(code: string, email: Account['email']) {
		const expectedEmail = await this.getEmailByCode(code);
		if (expectedEmail !== email) {
			throw new BadRequestException('Invalid or expired verification code.');
		}

		const account = await this.accountService.findByEmail(email);
		if (!account) {
			throw new BadRequestException('Invalid or expired verification code.');
		}

		if (account.isEmailVerified) {
			throw new BadRequestException('Email is already verified.');
		}

		const updatedAccount = await this.accountService.update(account.id, {isEmailVerified: true});
		await this.removeCode(code);
		return updatedAccount;
	}

	async sendWelcomeEmail(account: Account) {
		const {email, name} = account;

		const code = await this.createCode(email);
		const verificationUrl = await this.createUrl(code, email);

		await this.emailService.send({
			to: email,
			subject: `Welcome to Flair - ${code} is your verification code`,
			template: 'welcome',
			context: {name, verificationUrl, code},
		});
	}

	async sendVerifyEmail(account: Account) {
		const {email, name, isEmailVerified} = account;

		if (isEmailVerified) {
			throw new BadRequestException('Email is already verified.');
		}

		const code = await this.createCode(email);
		const verificationUrl = await this.createUrl(code, email);

		await this.emailService.send({
			to: email,
			subject: `${code} is your verification code`,
			template: 'verify-email',
			context: {name, verificationUrl, code},
		});

		return {message: 'Verification email sent.'};
	}

	async requestEmailChange(account: Account, dto: EmailChangeDto) {
		const {newEmail, password} = dto;

		await this.accountService.verifyPassword(account.password, password);
		await this.accountService.validateEmailIsUnique(newEmail);

		const code = await this.createCode(newEmail);

		await this.emailService.send({
			to: newEmail,
			subject: `${code} is your verification code`,
			template: 'verify-new-email',
			context: {name: account.name, code},
		});
		return {message: 'Verification email sent.'};
	}

	async verifyEmailChange(account: Account, code: string) {
		const newEmail = await this.getEmailByCode(code);

		await this.accountService.validateEmailIsUnique(newEmail);
		const updatedAccount = await this.accountService.update(account.id, {email: newEmail});

		await this.removeCode(code);
		return updatedAccount;
	}

	async createUrl(code: string, email: Account['email']) {
		const url = new URL('/verify', this.WEB_BASE_URL);
		url.search = new URLSearchParams({email, code}).toString();
		return url.toString();
	}

	async createCode(email: Account['email']) {
		while (true) {
			const code = Array.from({length: 6}, () => Math.floor(Math.random() * 10)).join('');
			const key = `${this.REDIS_KEY}:${code}`;

			try {
				await this.getEmailByCode(code);
			} catch {
				await this.redisClient.set(key, email, 'EX', this.EXPIRATION);
				return code;
			}
		}
	}

	async getEmailByCode(code: string) {
		const key = `${this.REDIS_KEY}:${code}`;
		const email = await this.redisClient.get(key);

		if (!email) {
			throw new BadRequestException('Invalid or expired verification code.');
		}
		return email;
	}

	async removeCode(code: string) {
		const key = `${this.REDIS_KEY}:${code}`;
		await this.redisClient.del(key);
	}
}
