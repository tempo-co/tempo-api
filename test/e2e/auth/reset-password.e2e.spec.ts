import {faker} from '@faker-js/faker';
import {Server} from 'node:net';
import request from 'supertest';

import {ConfigurationService} from '@core/config/config.service';
import {
	PASSWORD_RESET_CONFIRMATION,
	PASSWORD_RESET_INVALID_TOKEN,
	PASSWORD_RESET_SUCCESS,
	PASSWORD_SAME_AS_OLD,
} from '@modules/auth/api/constants/api-messages.constants';
import {PasswordResetRequestDto} from '@modules/auth/api/dtos/password-reset-request.dto';
import {PasswordResetVerifyDto} from '@modules/auth/api/dtos/password-reset-verify.dto';

import {getApp} from '../../setup/e2e.setup';
import {
	PW_CHANGE_ACCOUNT_EMAIL,
	PW_CHANGE_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../setup/seed.constants';
import {UUID_VALIDATION_REGEX} from '../../types/regex.constants';
import {EmailUtils} from '../../utils/email-utils';

describe('AuthController - Reset Password', () => {
	let mailpitApiUrl: string;
	let passwordResetExpiration: string;
	let webUrl: string;
	let httpServer: Server;

	beforeAll(async () => {
		const app = getApp();
		const config = app.get(ConfigurationService);
		mailpitApiUrl = config.get('EMAIL_UI_URL');
		passwordResetExpiration = config.get('PASSWORD_RESET_EXPIRATION');
		webUrl = config.get('WEB_BASE_URL');
		httpServer = app.getHttpServer();
	});

	beforeEach(async () => {
		await EmailUtils.clearEmails(mailpitApiUrl);
	});

	describe('/auth/reset-password/request (POST)', () => {
		let accountToResetEmail: string;

		beforeAll(async () => {
			accountToResetEmail = PW_CHANGE_ACCOUNT_EMAIL;
			const agent = request.agent(httpServer);
			await agent
				.post('/auth/login')
				.send({email: accountToResetEmail, password: PW_CHANGE_ACCOUNT_PASSWORD})
				.expect(200);
		});

		it('should send a password reset email for an existing account', async () => {
			const requestDto: PasswordResetRequestDto = {email: accountToResetEmail};

			await request(httpServer)
				.post('/auth/reset-password/request')
				.send(requestDto)
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(PASSWORD_RESET_CONFIRMATION);
				});

			const resetEmail = await EmailUtils.findEmailByRecipient(accountToResetEmail, mailpitApiUrl);
			expect(resetEmail).toBeDefined();

			const recipientEmail = resetEmail?.To[0].Address;
			const subject = resetEmail?.Subject;
			const body = EmailUtils.normalizeEmailText(resetEmail?.Text);
			const token = EmailUtils.extractToken(body);
			const expectedBody = EmailUtils.getPasswordResetEmailBody(
				requestDto.email,
				webUrl,
				token,
				passwordResetExpiration,
			);

			expect(recipientEmail).toEqual(accountToResetEmail);
			expect(token).toMatch(UUID_VALIDATION_REGEX);
			expect(subject).toBe('Reset your Flair password');
			expect(body).toBe(expectedBody);
		});

		it('should return confirmation even if the email does not exist', async () => {
			const nonExistentEmail = faker.internet.email();
			const requestDto: PasswordResetRequestDto = {email: nonExistentEmail};

			await request(httpServer)
				.post('/auth/reset-password/request')
				.send(requestDto)
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(PASSWORD_RESET_CONFIRMATION);
				});

			// Verify no email was sent
			const resetEmail = await EmailUtils.findEmailByRecipient(nonExistentEmail, mailpitApiUrl);
			expect(resetEmail).toBeUndefined();
		});

		it('should fail with 400 Bad Request if email format is invalid', async () => {
			const requestDto = {email: 'not-a-valid-email'};

			await request(httpServer)
				.post('/auth/reset-password/request')
				.send(requestDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/email must be an email/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request if email is missing', async () => {
			await request(httpServer)
				.post('/auth/reset-password/request')
				.send({})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/email should not be empty/i)]),
					);
				});
		});
	});

	describe('/auth/reset-password/verify (POST)', () => {
		let resetToken: string | null;
		let accountToResetEmail: string;
		let originalPassword: string;

		beforeEach(async () => {
			accountToResetEmail = VERIFIED_ACCOUNT_EMAIL;
			originalPassword = VERIFIED_ACCOUNT_PASSWORD;

			// 1. Request password reset to get a token
			const requestDto: PasswordResetRequestDto = {email: accountToResetEmail};
			await request(httpServer).post('/auth/reset-password/request').send(requestDto).expect(200);

			// 2. Extract token from email
			const resetEmail = await EmailUtils.findEmailByRecipient(accountToResetEmail, mailpitApiUrl);
			expect(resetEmail).toBeDefined();
			resetToken = EmailUtils.extractToken(resetEmail?.Text);
			expect(resetToken).toBeDefined();
			expect(resetToken).toMatch(UUID_VALIDATION_REGEX);
		});

		it('should fail with 400 Bad Request if new password is the same as the old password', async () => {
			const verifyDto: PasswordResetVerifyDto = {token: resetToken!, newPassword: originalPassword};

			await request(httpServer)
				.post('/auth/reset-password/verify')
				.send(verifyDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toBe(PASSWORD_SAME_AS_OLD);
				});

			await request(httpServer)
				.post('/auth/login')
				.send({email: accountToResetEmail, password: originalPassword})
				.expect(200);
		});

		it('should reset the password with a valid token and new password', async () => {
			const newPassword = faker.internet.password({length: 12});
			const verifyDto: PasswordResetVerifyDto = {token: resetToken!, newPassword: newPassword};

			await request(httpServer)
				.post('/auth/reset-password/verify')
				.send(verifyDto)
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(PASSWORD_RESET_SUCCESS);
				});

			// Verify login fails with old password
			await request(httpServer)
				.post('/auth/login')
				.send({email: accountToResetEmail, password: originalPassword})
				.expect(401);

			// Verify login succeeds with new password
			await request(httpServer)
				.post('/auth/login')
				.send({email: accountToResetEmail, password: newPassword})
				.expect(200);
		});

		it('should fail with 400 Bad Request for an invalid token', async () => {
			const verifyDto: PasswordResetVerifyDto = {
				token: faker.string.uuid(),
				newPassword: faker.internet.password({length: 12}),
			};

			await request(httpServer)
				.post('/auth/reset-password/verify')
				.send(verifyDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toBe(PASSWORD_RESET_INVALID_TOKEN);
				});
		});

		it('should fail with 400 Bad Request for a non-existent token', async () => {
			const verifyDto: PasswordResetVerifyDto = {
				token: faker.string.uuid(),
				newPassword: faker.internet.password({length: 12}),
			};

			await request(httpServer)
				.post('/auth/reset-password/verify')
				.send(verifyDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toBe(PASSWORD_RESET_INVALID_TOKEN);
				});
		});

		it('should fail with 400 Bad Request if the token has already been used', async () => {
			const newPassword = faker.internet.password({length: 12});
			const verifyDto: PasswordResetVerifyDto = {
				token: resetToken!,
				newPassword: newPassword,
			};

			// Use the token once successfully
			await request(httpServer).post('/auth/reset-password/verify').send(verifyDto).expect(200);

			// Attempt to use it again
			await request(httpServer)
				.post('/auth/reset-password/verify')
				.send(verifyDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toBe(PASSWORD_RESET_INVALID_TOKEN);
				});
		});

		it('should fail with 400 Bad Request if new password is too short', async () => {
			const verifyDto: PasswordResetVerifyDto = {token: resetToken!, newPassword: 'short'};

			await request(httpServer)
				.post('/auth/reset-password/verify')
				.send(verifyDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/newPassword must be longer than or equal to 8 characters/i),
						]),
					);
				});
		});

		it('should fail with 400 Bad Request if token is missing', async () => {
			const verifyDto = {newPassword: faker.internet.password({length: 12})};

			await request(httpServer)
				.post('/auth/reset-password/verify')
				.send(verifyDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/token should not be empty/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request if newPassword is missing', async () => {
			const verifyDto = {token: resetToken!};

			await request(httpServer)
				.post('/auth/reset-password/verify')
				.send(verifyDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/newPassword should not be empty/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request if new password exceeds maximum length (255)', async () => {
			const longPassword = faker.string.alpha(256);
			const verifyDto: PasswordResetVerifyDto = {token: resetToken!, newPassword: longPassword};

			await request(httpServer)
				.post('/auth/reset-password/verify')
				.send(verifyDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/newPassword must be shorter than or equal to 255 characters/i),
						]),
					);
				});
		});
	});
});
