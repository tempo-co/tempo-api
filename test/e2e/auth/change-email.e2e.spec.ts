import {faker} from '@faker-js/faker';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {ConfigurationService} from '@core/config/config.service';
import {
	EMAIL_ALREADY_IN_USE,
	EMAIL_CHANGE_SUCCESS,
	EMAIL_INVALID_TOKEN,
	EMAIL_NOT_VERIFIED,
	EMAIL_VERIFICATION_SENT,
} from '@modules/auth/api/constants/api-messages.constants';
import {EmailChangeRequestDto} from '@modules/auth/api/dtos/email-change.dto';
import {EmailVerifyDto} from '@modules/auth/api/dtos/email-verify.dto';
import {SignUpDto} from '@modules/auth/api/dtos/signup.dto';

import {
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../setup/constants';
import {getApp} from '../../setup/e2e.setup';
import {clearEmails, extractVerificationCode, findEmailByRecipient} from '../../utils/email.util';

describe('AuthController - Change email', () => {
	let mailhogApiUrl: string;
	let httpServer: Server;

	beforeAll(async () => {
		const app = getApp();

		mailhogApiUrl = app.get(ConfigurationService).get('EMAIL_UI_URL');
		httpServer = app.getHttpServer();
	});

	beforeEach(async () => {
		await clearEmails(mailhogApiUrl);
	});

	describe('/auth/change-email/check (HEAD)', () => {
		let verifiedAgent: TestAgent;
		let unverifiedAgent: TestAgent;
		let existingEmail: string;

		beforeAll(async () => {
			// Create an account to test conflict
			const conflictAccountDto: SignUpDto = {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer).post('/auth/signup').send(conflictAccountDto).expect(201);
			existingEmail = conflictAccountDto.email;

			// Setup authenticated agents
			verifiedAgent = request.agent(httpServer);
			await verifiedAgent
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
				.expect(200);
		});

		it('should return 204 No Content for an available email (Verified User)', async () => {
			const availableEmail = faker.internet.email();
			await verifiedAgent
				.head(`/auth/change-email/check?email=${encodeURIComponent(availableEmail)}`)
				.expect(204);
		});

		it('should fail with 403 Forbidden if the account email is not verified', async () => {
			const availableEmail = faker.internet.email();
			await unverifiedAgent
				.head(`/auth/change-email/check?email=${encodeURIComponent(availableEmail)}`)
				.expect(403);
		});

		it('should return 409 Conflict if the email is already in use by another account', async () => {
			await verifiedAgent
				.head(`/auth/change-email/check?email=${encodeURIComponent(existingEmail)}`)
				.expect(409)
				.expect((res) => {
					expect(res.status).toBe(409);
				});
		});

		it("should return 409 Conflict if the email is the account's own email", async () => {
			await verifiedAgent
				.head(`/auth/change-email/check?email=${encodeURIComponent(VERIFIED_ACCOUNT_EMAIL)}`)
				.expect(409);
		});

		it('should return 401 Unauthorized if the user is not authenticated', async () => {
			const emailToCheck = faker.internet.email();
			await request(httpServer)
				.head(`/auth/change-email/check?email=${encodeURIComponent(emailToCheck)}`)
				.expect(401);
		});

		it('should return 400 Bad Request if email query parameter is missing', async () => {
			await verifiedAgent.head('/auth/change-email/check').expect(400);
		});

		it('should return 400 Bad Request if email query parameter is empty', async () => {
			await verifiedAgent.head('/auth/change-email/check?email=').expect(400);
		});

		it('should return 400 Bad Request if email format is invalid', async () => {
			await verifiedAgent.head('/auth/change-email/check?email=not-a-valid-email').expect(400);
		});
	});

	describe('/auth/change-email/request (POST)', () => {
		let verifiedAgent: TestAgent;
		let verifiedName: string;
		let unverifiedAgent: TestAgent;
		let conflictAccountEmail: string;

		beforeAll(async () => {
			conflictAccountEmail = faker.internet.email();
			const conflictAccountDto: SignUpDto = {
				name: faker.person.fullName(),
				email: conflictAccountEmail,
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer).post('/auth/signup').send(conflictAccountDto).expect(201);
		});

		beforeEach(async () => {
			verifiedAgent = request.agent(httpServer);
			await verifiedAgent
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);
			const meResponse = await verifiedAgent.get('/accounts/me').expect(200);
			verifiedName = meResponse.body.name;

			unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			await clearEmails(mailhogApiUrl);
		});

		it('should send a verification email to the new email address for a verified account', async () => {
			const newEmail = faker.internet.email();
			const emailChangeDto: EmailChangeRequestDto = {newEmail};

			await verifiedAgent
				.post('/auth/change-email/request')
				.send(emailChangeDto)
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_VERIFICATION_SENT);
				});

			const verificationEmail = await findEmailByRecipient(newEmail, mailhogApiUrl);
			expect(verificationEmail).toBeDefined();

			const recipientEmail = verificationEmail?.To?.[0]?.Mailbox + '@' + verificationEmail?.To?.[0]?.Domain;
			const subject = verificationEmail?.Content?.Headers?.Subject?.[0];
			const body = verificationEmail?.Content?.Body;
			const code = extractVerificationCode(body);

			expect(recipientEmail).toEqual(newEmail);
			expect(subject).toContain('is your verification code');
			expect(body).toContain(verifiedName);
			expect(code).toMatch(/^\d{6}$/);
		});

		it('should fail with 401 Unauthorized if the user is not logged in', async () => {
			const emailChangeDto: EmailChangeRequestDto = {newEmail: faker.internet.email()};

			await request(httpServer)
				.post('/auth/change-email/request')
				.send(emailChangeDto)
				.expect(401)
				.expect((res) => {
					expect(res.body.message).toBe('Unauthorized');
				});
		});

		it('should fail with 403 Forbidden if the account email is not verified', async () => {
			const emailChangeDto: EmailChangeRequestDto = {newEmail: faker.internet.email()};

			await unverifiedAgent
				.post('/auth/change-email/request')
				.send(emailChangeDto)
				.expect(403)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_NOT_VERIFIED);
				});
		});

		it('should fail with 409 Conflict if the new email is already in use', async () => {
			const emailChangeDto: EmailChangeRequestDto = {newEmail: conflictAccountEmail};

			await verifiedAgent
				.post('/auth/change-email/request')
				.send(emailChangeDto)
				.expect(409)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_ALREADY_IN_USE);
				});
		});

		it('should fail with 400 Bad Request if newEmail is not a valid email format', async () => {
			const emailChangeDto: EmailChangeRequestDto = {newEmail: 'not-an-email'};

			await verifiedAgent
				.post('/auth/change-email/request')
				.send(emailChangeDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/newEmail must be an email/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request if newEmail is missing', async () => {
			await verifiedAgent
				.post('/auth/change-email/request')
				.send({})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/newEmail should not be empty/i)]),
					);
				});
		});
	});

	describe('/auth/change-email/verify (POST)', () => {
		let verifiedAgent: TestAgent;
		let verificationCode: string | null;
		let newEmailAddress: string;
		let initialAccountEmail: string = VERIFIED_ACCOUNT_EMAIL;

		beforeEach(async () => {
			verifiedAgent = request.agent(httpServer);
			await verifiedAgent
				.post('/auth/login')
				.send({email: initialAccountEmail, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			// Request email change and get the code
			const requestedNewEmail = faker.internet.email();
			const changeDto: EmailChangeRequestDto = {newEmail: requestedNewEmail};
			await verifiedAgent.post('/auth/change-email/request').send(changeDto).expect(200);

			const emailContent = await findEmailByRecipient(requestedNewEmail, mailhogApiUrl);
			const code = extractVerificationCode(emailContent?.Content?.Body);

			verificationCode = code;
			newEmailAddress = requestedNewEmail;
			expect(verificationCode).toBeDefined();
			expect(verificationCode).toMatch(/^\d{6}$/);

			await clearEmails(mailhogApiUrl);
		});

		it('should change the email with a valid code for an authenticated, verified account', async () => {
			await verifiedAgent
				.post('/auth/change-email/verify')
				.send({code: verificationCode})
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_CHANGE_SUCCESS);
				});

			const meResponse = await verifiedAgent.get('/accounts/me').expect(200);
			expect(meResponse.body.email).toEqual(newEmailAddress);
			initialAccountEmail = newEmailAddress;
		});

		it('should fail with 401 Unauthorized if the user is not logged in', async () => {
			await request(httpServer)
				.post('/auth/change-email/verify')
				.send({code: verificationCode})
				.expect(401)
				.expect((res) => {
					expect(res.body.message).toBe('Unauthorized');
				});
		});

		it('should fail with 403 Forbidden if the logged in account is not email-verified', async () => {
			const unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			await unverifiedAgent
				.post('/auth/change-email/verify')
				.send({code: verificationCode ?? '123456'})
				.expect(403)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_NOT_VERIFIED);
				});
		});

		it('should fail with 400 Bad Request for an invalid code', async () => {
			await verifiedAgent
				.post('/auth/change-email/verify')
				.send({code: '000000'})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_INVALID_TOKEN);
				});
		});

		it('should fail with 400 Bad Request if the code has already been used', async () => {
			await verifiedAgent.post('/auth/change-email/verify').send({code: verificationCode}).expect(200);

			initialAccountEmail = newEmailAddress;

			const agentWithNewEmail = request.agent(httpServer);
			await agentWithNewEmail
				.post('/auth/login')
				.send({email: newEmailAddress, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			await agentWithNewEmail
				.post('/auth/change-email/verify')
				.send({code: verificationCode})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_INVALID_TOKEN);
				});
		});

		it('should fail with 400 Bad Request for a malformed code (too short)', async () => {
			await verifiedAgent
				.post('/auth/change-email/verify')
				.send({code: '12345'})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/Verification code must be 6 digits/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request for a malformed code (non-digit)', async () => {
			await verifiedAgent
				.post('/auth/change-email/verify')
				.send({code: 'abcdef'})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/Verification code must be 6 digits/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request for a missing code', async () => {
			await verifiedAgent
				.post('/auth/change-email/verify')
				.send({})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/code should not be empty/i)]),
					);
				});
		});

		it('should fail with 409 Conflict if the email associated with the code is now taken (race condition)', async () => {
			// 1. Account A requests change to targetEmail (done in beforeEach)
			const codeForA = verificationCode;
			const targetEmail = newEmailAddress;
			expect(codeForA).toBeDefined();

			// 2. Create, verify and log in Account B
			const accountBCredentials: SignUpDto = {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer).post('/auth/signup').send(accountBCredentials).expect(201);

			const signupEmailB = await findEmailByRecipient(accountBCredentials.email, mailhogApiUrl);
			const signupCodeB = extractVerificationCode(signupEmailB?.Content?.Body);
			expect(signupCodeB).toBeDefined();

			const emailVerifyDto: EmailVerifyDto = {
				code: signupCodeB!,
				email: accountBCredentials.email,
			};
			await request(httpServer).post('/auth/signup/verify').send(emailVerifyDto).expect(200);

			const accountBAgent = request.agent(httpServer);
			await accountBAgent
				.post('/auth/login')
				.send({email: accountBCredentials.email, password: accountBCredentials.password})
				.expect(200);

			// 3. Account B requests change to the same targetEmail and gets their own code
			const changeDtoForB: EmailChangeRequestDto = {newEmail: targetEmail};
			await accountBAgent.post('/auth/change-email/request').send(changeDtoForB).expect(200);

			const emailForB = await findEmailByRecipient(targetEmail, mailhogApiUrl);
			const codeForB = extractVerificationCode(emailForB?.Content?.Body);
			expect(codeForB).toBeDefined();
			expect(codeForB).not.toEqual(codeForA);

			// 4. Account B successfully verifies their code, taking the targetEmail address
			await accountBAgent.post('/auth/change-email/verify').send({code: codeForB}).expect(200);

			// 5. Account A now tries to verify their original code for the now-taken email, expect conflict
			await verifiedAgent
				.post('/auth/change-email/verify')
				.send({code: codeForA})
				.expect(409)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_ALREADY_IN_USE);
				});

			initialAccountEmail = VERIFIED_ACCOUNT_EMAIL;
		});
	});
});
