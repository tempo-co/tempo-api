import {faker} from '@faker-js/faker';
import {INestApplication} from '@nestjs/common';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {Account} from '@modules/account/account.entity';
import {AccountUpdateDto} from '@modules/account/api/account-update.dto';
import {EMAIL_NOT_VERIFIED} from '@modules/auth/api/constants/api-messages.constants';

import {
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../setup/constants';
import {getApp} from '../../setup/e2e.setup';

describe('Account controller - /me', () => {
	let httpServer: Server;
	let app: INestApplication;

	beforeAll(async () => {
		app = getApp();
		httpServer = app.getHttpServer();
	});

	describe('/accounts/me (GET)', () => {
		it('should return the current VERIFIED authenticated account', async () => {
			const agent = request.agent(httpServer);

			await agent
				.post('/auth/login')
				.send({
					email: VERIFIED_ACCOUNT_EMAIL,
					password: VERIFIED_ACCOUNT_PASSWORD,
				})
				.expect(200);

			const response = await agent.get('/accounts/me').expect(200);

			const account: Account = response.body;
			expect(account).toBeDefined();
			expect(account.id).toBeDefined();
			expect(account.email).toEqual(VERIFIED_ACCOUNT_EMAIL);
			expect(account.name).toEqual('Verified Account');
			expect(account.isEmailVerified).toBe(true);
			expect(account.createdAt).toBeDefined();
			expect(account.password).toBeUndefined();
			expect(account.bankAccounts).toBeUndefined();
		});

		it('should return the current UNVERIFIED authenticated account', async () => {
			const agent = request.agent(httpServer);

			await agent
				.post('/auth/login')
				.send({
					email: UNVERIFIED_ACCOUNT_EMAIL,
					password: UNVERIFIED_ACCOUNT_PASSWORD,
				})
				.expect(200);

			const response = await agent.get('/accounts/me').expect(200);

			const account: Account = response.body;
			expect(account).toBeDefined();
			expect(account.id).toBeDefined();
			expect(account.email).toEqual(UNVERIFIED_ACCOUNT_EMAIL);
			expect(account.name).toEqual('Unverified Account');
			expect(account.isEmailVerified).toBe(false);
			expect(account.createdAt).toBeDefined();
			expect(account.password).toBeUndefined();
			expect(account.bankAccounts).toBeUndefined();
		});

		it('should return 401 Unauthorized if the user is not authenticated', async () => {
			await request(httpServer).get('/accounts/me').expect(401);
		});
	});

	describe('/accounts/me (PATCH)', () => {
		let verifiedAgent: TestAgent;
		let unverifiedAgent: TestAgent;

		beforeAll(async () => {
			verifiedAgent = request.agent(httpServer);
			await verifiedAgent
				.post('/auth/login')
				.send({
					email: VERIFIED_ACCOUNT_EMAIL,
					password: VERIFIED_ACCOUNT_PASSWORD,
				})
				.expect(200);

			unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({
					email: UNVERIFIED_ACCOUNT_EMAIL,
					password: UNVERIFIED_ACCOUNT_PASSWORD,
				})
				.expect(200);
		});

		it('should update the name for an authenticated VERIFIED account', async () => {
			const newName = faker.person.fullName();
			const updateDto: AccountUpdateDto = {name: newName};

			const patchResponse = await verifiedAgent.patch('/accounts/me').send(updateDto).expect(200);

			const updatedAccount: Account = patchResponse.body;
			expect(updatedAccount).toBeDefined();
			expect(updatedAccount.name).toEqual(newName);
			expect(updatedAccount.email).toEqual(VERIFIED_ACCOUNT_EMAIL);
			expect(updatedAccount.isEmailVerified).toBe(true);
			expect(updatedAccount.password).toBeUndefined();

			const getResponse = await verifiedAgent.get('/accounts/me').expect(200);
			expect(getResponse.body.name).toEqual(newName);
		});

		it('should strip disallowed fields and update the name for an authenticated VERIFIED account', async () => {
			const updateDto: AccountUpdateDto = {name: 'Valid name Again'};

			await verifiedAgent
				.patch('/accounts/me')
				.send(updateDto)
				.expect(200)
				.expect((res) => {
					expect(res.body.name).toEqual('Valid name Again');
					expect(res.body.email).toEqual(VERIFIED_ACCOUNT_EMAIL);
				});
		});

		it('should return 403 Forbidden for an UNVERIFIED account', async () => {
			const updateDto: AccountUpdateDto = {name: faker.person.fullName()};

			await unverifiedAgent
				.patch('/accounts/me')
				.send(updateDto)
				.expect(403)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_NOT_VERIFIED);
				});
		});

		it('should return 401 Unauthorized if the user is not authenticated', async () => {
			const updateDto: AccountUpdateDto = {name: 'Attempt Update'};
			await request(httpServer).patch('/accounts/me').send(updateDto).expect(401);
		});

		it('should return 400 Bad Request if name is missing', async () => {
			await verifiedAgent
				.patch('/accounts/me')
				.send({})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/name must be a string/i)]),
					);
				});
		});

		it('should return 400 Bad Request if name is empty', async () => {
			const updateDto: AccountUpdateDto = {name: ''};
			await verifiedAgent
				.patch('/accounts/me')
				.send(updateDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/name must be longer than or equal to 1 characters/i),
						]),
					);
				});
		});

		it('should return 400 Bad Request if name is too long', async () => {
			const longName = 'a'.repeat(256);
			const updateDto: AccountUpdateDto = {name: longName};
			await verifiedAgent
				.patch('/accounts/me')
				.send(updateDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/name must be shorter than or equal to 255 characters/i),
						]),
					);
				});
		});

		it('should return 400 Bad Request if name is not a string', async () => {
			const updateDto: AccountUpdateDto = {name: 12345 as unknown as string};
			await verifiedAgent
				.patch('/accounts/me')
				.send(updateDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/name must be a string/i)]),
					);
				});
		});
	});
});
