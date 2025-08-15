import {faker} from '@faker-js/faker';
import {INestApplication} from '@nestjs/common';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {BankAccountCreateDto} from '@modules/bank-account/api/bank-account-create.dto';
import {BankAccount} from '@modules/bank-account/bank-account.entity';
import {Bank} from '@modules/transaction/transaction-mapper/constants/bank.enum';

import {getApp} from '../../setup/e2e.setup';
import {
	SESSION_TEST_ACCOUNT_EMAIL,
	SESSION_TEST_ACCOUNT_PASSWORD,
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../setup/seed.constants';

describe('BankAccountController', () => {
	let app: INestApplication;
	let httpServer: Server;
	let verifiedAgent: TestAgent;
	let unverifiedAgent: TestAgent;

	beforeAll(async () => {
		app = getApp();
		httpServer = app.getHttpServer();

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

	describe('POST /bank-accounts', () => {
		it('should create a bank account for a verified user', async () => {
			const bankAccountDto: BankAccountCreateDto = {
				alias: 'Test Bank Account',
				bank: Bank.REVOLUT,
				currency: 'USD',
			};

			const response = await verifiedAgent.post('/bank-accounts').send(bankAccountDto).expect(201);

			expect(response.body).toEqual({
				id: expect.any(String),
				alias: bankAccountDto.alias,
				bank: bankAccountDto.bank,
				currency: bankAccountDto.currency,
				balance: '0.00',
			});
		});

		it('should not create a bank account for an unverified user', async () => {
			const bankAccountDto: BankAccountCreateDto = {
				alias: 'Unverified Bank Account',
				bank: Bank.ABN_AMRO,
				currency: 'EUR',
			};

			await unverifiedAgent.post('/bank-accounts').send(bankAccountDto).expect(403);
		});

		it('should fail with 400 Bad Request for invalid data', async () => {
			await verifiedAgent.post('/bank-accounts').send({}).expect(400);
			await verifiedAgent.post('/bank-accounts').send({bank: 'INVALID_BANK', currency: 'USD'}).expect(400);

			await verifiedAgent
				.post('/bank-accounts')
				.send({bank: Bank.REVOLUT, currency: 'INVALID_CURRENCY'})
				.expect(400);
		});

		it('should fail with 401 Unauthorized if user is not authenticated', async () => {
			const bankAccountDto: BankAccountCreateDto = {
				alias: 'Unauthorized Bank Account',
				bank: Bank.REVOLUT,
				currency: 'USD',
			};

			await request(httpServer).post('/bank-accounts').send(bankAccountDto).expect(401);
		});
	});

	describe('GET /bank-accounts', () => {
		let createdAccountId: string;

		beforeAll(async () => {
			const bankAccountDto: BankAccountCreateDto = {
				alias: 'Bank Account to Get',
				bank: Bank.REVOLUT,
				currency: 'GBP',
			};
			const response = await verifiedAgent.post('/bank-accounts').send(bankAccountDto).expect(201);
			createdAccountId = response.body.id;
		});

		it('should get all bank accounts for a verified user', async () => {
			const response = await verifiedAgent.get('/bank-accounts').expect(200);

			expect(Array.isArray(response.body)).toBe(true);
			expect(response.body.length).toBeGreaterThan(0);
			const accounts = response.body as BankAccount[];
			const foundAccount = accounts.find((account) => account.id === createdAccountId);
			expect(foundAccount).toBeDefined();
		});

		it('should fail with 401 Unauthorized if user is not authenticated', async () => {
			await request(httpServer).get('/bank-accounts').expect(401);
		});
	});

	describe('GET /bank-accounts/:id', () => {
		let createdAccountId: string;

		beforeAll(async () => {
			const bankAccountDto: BankAccountCreateDto = {
				alias: 'Bank Account',
				bank: Bank.ABN_AMRO,
				currency: 'EUR',
			};
			const response = await verifiedAgent.post('/bank-accounts').send(bankAccountDto).expect(201);
			createdAccountId = response.body.id;
		});

		it('should get a bank account by id for the owner', async () => {
			const response = await verifiedAgent.get(`/bank-accounts/${createdAccountId}`).expect(200);
			expect(response.body.id).toEqual(createdAccountId);
		});

		it('should fail with 404 Not Found for a non-existent bank account', async () => {
			const nonExistentId = faker.string.uuid();
			await verifiedAgent.get(`/bank-accounts/${nonExistentId}`).expect(404);
		});

		it('should fail with 404 Not Found when trying to get another user’s bank account', async () => {
			const verifiedAgent2 = request.agent(httpServer);
			await verifiedAgent2
				.post('/auth/login')
				.send({
					email: SESSION_TEST_ACCOUNT_EMAIL,
					password: SESSION_TEST_ACCOUNT_PASSWORD,
				})
				.expect(200);
			await verifiedAgent2.get(`/bank-accounts/${createdAccountId}`).expect(404);
		});

		it('should fail with 400 Bad Request for an invalid UUID', async () => {
			await verifiedAgent.get('/bank-accounts/invalid-uuid').expect(400);
		});

		it('should fail with 401 Unauthorized if user is not authenticated', async () => {
			await request(httpServer).get(`/bank-accounts/${createdAccountId}`).expect(401);
		});
	});
});
