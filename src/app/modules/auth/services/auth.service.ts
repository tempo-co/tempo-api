import {Injectable} from '@nestjs/common';
import argon2 from 'argon2';
import {plainToInstance} from 'class-transformer';
import {Request} from 'express';

import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';

import {ChangePasswordDto} from '../api/dtos/change-password.dto';
import {SignUpDto} from '../api/dtos/signup.dto';
import {EmailVerifierService} from './email-verifier.service';
import {SessionService} from './session.service';

@Injectable()
export class AuthService {
	constructor(
		private readonly emailVerifierService: EmailVerifierService,
		private readonly accountService: AccountService,
		private readonly sessionService: SessionService,
	) {}

	async signUp({name, email, password}: SignUpDto, request: Request) {
		await this.accountService.validateEmailIsUnique(email);

		const hash = await argon2.hash(password);
		const account = await this.accountService.save(name, email, hash);

		await this.emailVerifierService.sendWelcomeEmail(account);
		await this.logIn(account, request);
		return plainToInstance(Account, account);
	}

	async logOut(request: Request) {
		await new Promise<void>((resolve) => {
			request.logOut({keepSessionInfo: false}, () => {
				resolve();
			});
			request.session.destroy(() => {
				resolve();
			});
		});
		return {message: 'User logged out.'};
	}

	async logIn(account: Account, request: Request) {
		await new Promise<void>((resolve) => {
			request.logIn(account, () => {
				resolve();
			});
		});
		await this.sessionService.initializeSessionMetadata(request);
		return {message: 'User logged in.'};
	}

	async changePassword(account: Account, dto: ChangePasswordDto) {
		await this.accountService.verifyPassword(account.password, dto.currentPassword);

		const hash = await argon2.hash(dto.newPassword);
		await this.accountService.update(account.id, {password: hash});
		return {message: 'Password changed.'};
	}
}
