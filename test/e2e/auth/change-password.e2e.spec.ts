import {faker} from '@faker-js/faker';
import {Server} from 'node:net';
import request from 'supertest';

import {EMAIL_NOT_VERIFIED, PASSWORD_CHANGE_SUCCESS} from '@modules/auth/api/constants/api-messages.constants';
import {PasswordChangeDto} from '@modules/auth/api/dtos/password-change.dto';

import {getApp} from '../../setup/e2e.setup';
import {
	PW_CHANGE_ACCOUNT_EMAIL,
	PW_CHANGE_ACCOUNT_PASSWORD,
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../setup/seed.constants';

describe('AuthController - Change password', () => {
	let httpServer: Server;

	beforeAll(() => {
		httpServer = getApp().getHttpServer();
	});

	describe('/auth/change-password (POST)', () => {
		it('should change password for authenticated account and allow login with new password', async () => {
			const agent = request.agent(httpServer);
			await agent
				.post('/auth/login')
				.send({
					email: PW_CHANGE_ACCOUNT_EMAIL,
					password: PW_CHANGE_ACCOUNT_PASSWORD,
				})
				.expect(200);

			const newPassword = faker.internet.password({length: 12});
			const changePasswordDto: PasswordChangeDto = {
				currentPassword: PW_CHANGE_ACCOUNT_PASSWORD,
				newPassword: newPassword,
			};

			await agent
				.post('/auth/change-password')
				.send(changePasswordDto)
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toEqual(PASSWORD_CHANGE_SUCCESS);
				});

			await agent.post('/auth/logout').expect(200);

			// Old password fails login
			await request(httpServer)
				.post('/auth/login')
				.send({email: PW_CHANGE_ACCOUNT_EMAIL, password: PW_CHANGE_ACCOUNT_PASSWORD})
				.expect(401);

			// New password succeeds login
			await request(httpServer)
				.post('/auth/login')
				.send({email: PW_CHANGE_ACCOUNT_EMAIL, password: newPassword})
				.expect(200);
		});

		it('should fail with 401 Unauthorized if current password is incorrect', async () => {
			const agent = request.agent(httpServer);
			await agent
				.post('/auth/login')
				.send({
					email: VERIFIED_ACCOUNT_EMAIL,
					password: VERIFIED_ACCOUNT_PASSWORD,
				})
				.expect(200);

			const changePasswordDto: PasswordChangeDto = {
				currentPassword: 'wrong-current-password',
				newPassword: faker.internet.password({length: 12}),
			};

			await agent.post('/auth/change-password').send(changePasswordDto).expect(401);
		});

		it('should fail with 403 Forbidden when unverified account tries to change password', async () => {
			const unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			const newPassword = faker.internet.password({length: 12});
			const changePasswordDto: PasswordChangeDto = {
				currentPassword: UNVERIFIED_ACCOUNT_PASSWORD,
				newPassword: newPassword,
			};

			await unverifiedAgent
				.post('/auth/change-password')
				.send(changePasswordDto)
				.expect(403)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_NOT_VERIFIED);
				});
		});

		it('should fail with 400 Bad Request if new password is too short', async () => {
			const agent = request.agent(httpServer);
			await agent
				.post('/auth/login')
				.send({
					email: VERIFIED_ACCOUNT_EMAIL,
					password: VERIFIED_ACCOUNT_PASSWORD,
				})
				.expect(200);

			const changePasswordDto: PasswordChangeDto = {
				currentPassword: VERIFIED_ACCOUNT_PASSWORD,
				newPassword: 'short',
			};

			await agent
				.post('/auth/change-password')
				.send(changePasswordDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/newPassword must be longer than or equal to 8 characters/i),
						]),
					);
				});
		});

		it('should fail with 400 Bad Request if current password is missing', async () => {
			const agent = request.agent(httpServer);
			await agent
				.post('/auth/login')
				.send({
					email: VERIFIED_ACCOUNT_EMAIL,
					password: VERIFIED_ACCOUNT_PASSWORD,
				})
				.expect(200);

			const changePasswordDto: Partial<PasswordChangeDto> = {
				newPassword: faker.internet.password({length: 12}),
			};

			await agent
				.post('/auth/change-password')
				.send(changePasswordDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/currentPassword should not be empty/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request if new password is missing', async () => {
			const agent = request.agent(httpServer);
			await agent
				.post('/auth/login')
				.send({
					email: VERIFIED_ACCOUNT_EMAIL,
					password: VERIFIED_ACCOUNT_PASSWORD,
				})
				.expect(200);

			const changePasswordDto: Partial<PasswordChangeDto> = {
				currentPassword: VERIFIED_ACCOUNT_PASSWORD,
			};

			await agent
				.post('/auth/change-password')
				.send(changePasswordDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/newPassword should not be empty/i)]),
					);
				});
		});

		it('should fail with 401 Unauthorized if user is not logged in', async () => {
			const newPassword = faker.internet.password({length: 12});
			const changePasswordDto: PasswordChangeDto = {
				currentPassword: VERIFIED_ACCOUNT_PASSWORD,
				newPassword: newPassword,
			};

			await request(httpServer).post('/auth/change-password').send(changePasswordDto).expect(401);
		});
	});
});
