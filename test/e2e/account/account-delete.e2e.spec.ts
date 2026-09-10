import {faker} from '@faker-js/faker';
import {INestApplication} from '@nestjs/common';
import Redis from 'ioredis';
import {Server} from 'node:net';
import request from 'supertest';
import {DataSource} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {REDIS} from '@core/redis/redis.constants';
import {ACCOUNT_DELETED_EMAIL_SUBJECT, ACCOUNT_DELETED_MESSAGE} from '@modules/account/account-deletion.service';
import {EMAIL_NOT_VERIFIED} from '@modules/auth/api/constants/api-messages.constants';
import {BankAccountBalance} from '@modules/banking/bank-account-balance.entity';
import {BankAccount} from '@modules/banking/bank-account.entity';
import {BankConnection} from '@modules/banking/bank-connection.entity';
import {BankSyncRun} from '@modules/banking/bank-sync-run.entity';
import {BankTransaction} from '@modules/banking/bank-transaction.entity';

import {
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../../scripts/seed-data/seed.constants';
import {getApp} from '../../setup/e2e.setup';
import {EmailUtils} from '../../utils/email-utils';

describe('AccountController - DELETE /accounts/me', () => {
	let app: INestApplication;
	let httpServer: Server;
	let mailpitApiUrl: string;
	let dataSource: DataSource;
	let connectionRepository: ReturnType<DataSource['getRepository']>;
	let bankAccountRepository: ReturnType<DataSource['getRepository']>;
	let balanceRepository: ReturnType<DataSource['getRepository']>;
	let transactionRepository: ReturnType<DataSource['getRepository']>;
	let redis: Redis;

	beforeAll(async () => {
		app = getApp();
		httpServer = app.getHttpServer();
		const config = app.get(ConfigurationService);
		mailpitApiUrl = config.get('EMAIL_UI_URL');
		dataSource = app.get(DataSource);
		connectionRepository = dataSource.getRepository(BankConnection);
		bankAccountRepository = dataSource.getRepository(BankAccount);
		balanceRepository = dataSource.getRepository(BankAccountBalance);
		transactionRepository = dataSource.getRepository(BankTransaction);
		redis = app.get<Redis>(REDIS);
	});

	beforeEach(async () => {
		await EmailUtils.clearEmails(mailpitApiUrl);
	});

	async function seedBankingData(accountId: string) {
		const connection = await connectionRepository.save(
			connectionRepository.create({
				account: {id: accountId},
				provider: 'enable-banking',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
				status: 'AUTHORIZED',
				providerSessionId: 'encrypted-session-id',
				consentValidUntil: new Date(Date.now() + 86_400_000),
			}),
		);
		const syncRun = await dataSource.getRepository(BankSyncRun).save(
			dataSource.getRepository(BankSyncRun).create({
				bankConnection: {id: connection.id},
				status: 'SUCCEEDED',
				finishedAt: new Date(),
			}),
		);
		const bankAccount = await bankAccountRepository.save(
			bankAccountRepository.create({
				bankConnection: {id: connection.id},
				providerAccountId: 'provider-account-1',
				identificationHash: 'identification-hash',
				currency: 'EUR',
			}),
		);
		await balanceRepository.save(
			balanceRepository.create({
				bankAccountId: bankAccount.id,
				bankSyncRunId: syncRun.id,
				balanceType: 'closingBooked',
				amount: '123.45',
				currency: 'EUR',
			}),
		);
		await transactionRepository.save(
			transactionRepository.create({
				bankAccountId: bankAccount.id,
				dedupeKey: 'dedupe-1',
				amount: '-10.00',
				displayDescription: 'Transaction',
				currency: 'EUR',
			}),
		);
	}

	async function countOwnedAccounts(repository: ReturnType<DataSource['getRepository']>, accountId: string) {
		return repository.count({where: {account: {id: accountId}}});
	}

	it('deletes a verified account with password confirmation and cascades all bank data', async () => {
		const email = faker.internet.email().toLowerCase();
		const password = 'delete-account-password';
		const name = faker.person.fullName();
		const agent = request.agent(httpServer);

		const signupResponse = await agent.post('/auth/signup').send({name, email, password}).expect(201);
		const accountId: string = signupResponse.body.id;
		expect(accountId).toBeDefined();

		// Deletion requires a verified account; fetch the welcome code and verify.
		const welcomeEmail = await EmailUtils.findEmailByRecipient(email, mailpitApiUrl);
		const code = EmailUtils.extractCode(welcomeEmail?.Text);
		expect(code).toHaveLength(6);
		await agent.post('/auth/signup/verify').send({email, code}).expect(200);

		await seedBankingData(accountId);
		expect(await countOwnedAccounts(connectionRepository, accountId)).toBe(1);

		// A second session of the same account must die with the account too.
		const secondSessionAgent = request.agent(httpServer);
		await secondSessionAgent.post('/auth/login').send({email, password}).expect(200);
		await secondSessionAgent.get('/accounts/me').expect(200);

		// Pending bank authorization states are cleaned up per account, not globally.
		const ownedStateKey = `banking:authorization:e2e-owned-${accountId}`;
		const otherStateKey = 'banking:authorization:e2e-other';
		await redis.set(
			ownedStateKey,
			JSON.stringify({
				accountId,
				connectionId: 'e2e-connection',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
				expiresAt: Date.now() + 60_000,
			}),
			'EX',
			600,
		);
		await redis.set(
			otherStateKey,
			JSON.stringify({
				accountId: 'someone-else',
				connectionId: 'e2e-connection-2',
				aspspName: 'Rabobank',
				aspspCountry: 'NL',
				expiresAt: Date.now() + 60_000,
			}),
			'EX',
			600,
		);

		// Wrong password is rejected and the account survives.
		await agent.delete('/accounts/me').send({password: 'wrong-password'}).expect(401);
		expect(await countOwnedAccounts(connectionRepository, accountId)).toBe(1);
		expect(await redis.get(ownedStateKey)).not.toBeNull();

		const deleteResponse = await agent.delete('/accounts/me').send({password}).expect(200);
		expect(deleteResponse.body.message).toEqual(ACCOUNT_DELETED_MESSAGE);

		// FK cascades must have removed every bank-owned row.
		expect(await countOwnedAccounts(connectionRepository, accountId)).toBe(0);
		expect(await bankAccountRepository.count({where: {bankConnection: {account: {id: accountId}}}})).toBe(0);
		expect(
			await balanceRepository.count({where: {bankAccount: {bankConnection: {account: {id: accountId}}}}}),
		).toBe(0);
		expect(
			await transactionRepository.count({where: {bankAccount: {bankConnection: {account: {id: accountId}}}}}),
		).toBe(0);

		// The owned pending authorization state is gone; the other account's survives.
		expect(await redis.get(ownedStateKey)).toBeNull();
		expect(await redis.get(otherStateKey)).not.toBeNull();
		await redis.del(otherStateKey);

		// All sessions (including the caller's and the second session's) were revoked.
		await agent.get('/accounts/me').expect(401);
		await secondSessionAgent.get('/accounts/me').expect(401);

		// The account can no longer log in.
		await request(httpServer).post('/auth/login').send({email, password}).expect(401);

		// A farewell email is delivered to the deleted address.
		const farewellEmail = await EmailUtils.findEmailByRecipient(
			email,
			mailpitApiUrl,
			ACCOUNT_DELETED_EMAIL_SUBJECT,
		);
		expect(farewellEmail?.Subject).toEqual(ACCOUNT_DELETED_EMAIL_SUBJECT);
	}, 30_000);

	it('returns 403 Forbidden for an unverified account', async () => {
		const agent = request.agent(httpServer);
		await agent
			.post('/auth/login')
			.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
			.expect(200);

		await agent
			.delete('/accounts/me')
			.send({password: UNVERIFIED_ACCOUNT_PASSWORD})
			.expect(403)
			.expect((res) => {
				expect(res.body.message).toBe(EMAIL_NOT_VERIFIED);
			});
	});

	it('returns 400 Bad Request if the password is missing', async () => {
		const agent = request.agent(httpServer);
		await agent
			.post('/auth/login')
			.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
			.expect(200);

		await agent
			.delete('/accounts/me')
			.send({})
			.expect(400)
			.expect((res) => {
				expect(res.body.message).toEqual(
					expect.arrayContaining([
						expect.stringMatching(/password must be longer than or equal to 8 characters/i),
					]),
				);
			});
	});

	it('returns 401 Unauthorized if the user is not authenticated', async () => {
		await request(httpServer).delete('/accounts/me').send({password: VERIFIED_ACCOUNT_PASSWORD}).expect(401);
	});
});
