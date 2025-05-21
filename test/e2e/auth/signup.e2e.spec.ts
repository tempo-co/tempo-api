import {faker} from '@faker-js/faker';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {ConfigurationService} from '@core/config/config.service';
import {
	EMAIL_ALREADY_IN_USE,
	EMAIL_ALREADY_VERIFIED,
	EMAIL_INVALID_TOKEN,
	EMAIL_VERIFICATION_SENT,
	EMAIL_VERIFICATION_SUCCESS,
} from '@modules/auth/api/constants/api-messages.constants';
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

describe('AuthController - Signup', () => {
	let mailpitApiUrl: string;
	let httpServer: Server;

	beforeAll(async () => {
		const app = getApp();
		mailpitApiUrl = app.get(ConfigurationService).get('EMAIL_UI_URL');
		httpServer = app.getHttpServer();
	});

	beforeEach(async () => {
		await clearEmails(mailpitApiUrl);
	});

	describe('/auth/signup (POST)', () => {
		it('should create a new account and send welcome email', async () => {
			const signUpDto: SignUpDto = {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({length: 10}),
			};

			const response = await request(httpServer).post('/auth/signup').send(signUpDto).expect(201);

			expect(response.body?.email).toEqual(signUpDto.email);
			expect(response.body?.name).toEqual(signUpDto.name);
			expect(response.body?.id).toBeDefined();
			expect(response.body?.isEmailVerified).toBe(false);
			expect(response.body?.createdAt).toBeDefined();

			const welcomeEmail = await findEmailByRecipient(signUpDto.email, mailpitApiUrl);
			expect(welcomeEmail).toBeDefined();

			const recipientEmail = welcomeEmail?.To[0].Address;
			const subject = welcomeEmail?.Subject;
			const body = welcomeEmail?.Text;

			expect(recipientEmail).toEqual(signUpDto.email);
			expect(subject).toContain('Welcome to Flair');
			expect(subject).toContain('is your verification code');
			expect(body).toContain(signUpDto.name);
			expect(body).toMatch(/Or use the[\s\S]*?following code:\s*(\d{6})/i);
		});

		it('should fail with 409 Conflict if email is already in use', async () => {
			const email = faker.internet.email();
			const existingAccountDto: SignUpDto = {
				name: faker.person.fullName(),
				email: email,
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer).post('/auth/signup').send(existingAccountDto).expect(201);

			const duplicateSignUpDto: SignUpDto = {
				name: faker.person.fullName(),
				email: email,
				password: faker.internet.password({length: 11}),
			};

			return request(httpServer)
				.post('/auth/signup')
				.send(duplicateSignUpDto)
				.expect(409)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_ALREADY_IN_USE);
				});
		});

		it('should fail with 400 Bad Request if password is too short', async () => {
			const signUpDto: SignUpDto = {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: '123',
			};

			return request(httpServer)
				.post('/auth/signup')
				.send(signUpDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/password must be longer than or equal to 8 characters/i),
						]),
					);
				});
		});

		it('should fail with 400 Bad Request if name is missing', async () => {
			const signUpDto: Pick<SignUpDto, 'email' | 'password'> = {
				email: faker.internet.email(),
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer)
				.post('/auth/signup')
				.send(signUpDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/name should not be empty/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request if email is missing', async () => {
			const signUpDto: Partial<SignUpDto> = {
				name: faker.person.fullName(),
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer)
				.post('/auth/signup')
				.send(signUpDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/email should not be empty/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request if name is empty', async () => {
			const signUpDto: SignUpDto = {
				name: '',
				email: faker.internet.email(),
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer)
				.post('/auth/signup')
				.send(signUpDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/name should not be empty/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request if email is empty', async () => {
			const signUpDto: SignUpDto = {
				name: faker.person.fullName(),
				email: '',
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer)
				.post('/auth/signup')
				.send(signUpDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/email should not be empty/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request if email is not a valid email format', async () => {
			const signUpDto: SignUpDto = {
				name: faker.person.fullName(),
				email: 'not-a-valid-email',
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer)
				.post('/auth/signup')
				.send(signUpDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/email must be an email/i)]),
					);
				});
		});
	});

	describe('/auth/signup/resend (POST)', () => {
		let unverifiedAgent: TestAgent;
		let verifiedAgent: TestAgent;

		beforeEach(async () => {
			unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			verifiedAgent = request.agent(httpServer);
			await verifiedAgent
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			await clearEmails(mailpitApiUrl);
		});

		it('should send a new verification email for an unverified account', async () => {
			await unverifiedAgent
				.post('/auth/signup/resend')
				.send()
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_VERIFICATION_SENT);
				});

			const verificationEmail = await findEmailByRecipient(UNVERIFIED_ACCOUNT_EMAIL, mailpitApiUrl);
			expect(verificationEmail).toBeDefined();

			const recipientEmail = verificationEmail?.To[0].Address;
			const subject = verificationEmail?.Subject;
			const body = verificationEmail?.Text;

			expect(recipientEmail).toEqual(UNVERIFIED_ACCOUNT_EMAIL);
			expect(subject).toContain('is your verification code');
			expect(body).toMatch(/Or use the[\s\S]*?following code:\s*(\d{6})/i);
		});

		it('should fail with 400 Bad Request if the email is already verified', async () => {
			await verifiedAgent
				.post('/auth/signup/resend')
				.send()
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_ALREADY_VERIFIED);
				});

			const email = await findEmailByRecipient(VERIFIED_ACCOUNT_EMAIL, mailpitApiUrl);
			expect(email).toBeUndefined();
		});

		it('should fail with 401 Unauthorized if the user is not logged in', async () => {
			await request(httpServer)
				.post('/auth/signup/resend')
				.send()
				.expect(401)
				.expect((res) => {
					expect(res.body.message).toBe('Unauthorized');
				});
		});
	});

	describe('/auth/signup/verify (POST)', () => {
		let verificationCode: string | null;
		let accountCredentials: SignUpDto;
		let agent: TestAgent;

		beforeEach(async () => {
			accountCredentials = {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({length: 10}),
			};
			await request(httpServer).post('/auth/signup').send(accountCredentials).expect(201);

			const welcomeEmail = await findEmailByRecipient(accountCredentials.email, mailpitApiUrl);
			verificationCode = extractVerificationCode(welcomeEmail?.Text);
			expect(verificationCode).toBeDefined();
			expect(verificationCode).toMatch(/^\d{6}$/);

			agent = request.agent(httpServer);
			await agent.post('/auth/login').send(accountCredentials).expect(200);

			await clearEmails(mailpitApiUrl);
		});

		it('should verify email with correct code and email (unauthenticated)', async () => {
			const payload: EmailVerifyDto = {code: verificationCode!, email: accountCredentials.email};

			const response = await request(httpServer)
				.post('/auth/signup/verify')
				.send(payload)
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_VERIFICATION_SUCCESS);
				});

			const cookiesHeader = response.headers['set-cookie'];
			expect(cookiesHeader).toBeDefined();
			const sessionCookie = ([] as string[])
				.concat(cookiesHeader || [])
				.find((cookie: string) => cookie.startsWith('session='));
			expect(sessionCookie).toBeDefined();

			const agent = request.agent(httpServer);
			await agent.post('/auth/login').send(accountCredentials).expect(200);

			const meResponse = await agent.get('/accounts/me').expect(200);
			expect(meResponse.body.isEmailVerified).toBe(true);
		});

		it('should verify email with correct code and email (authenticated)', async () => {
			const payload: EmailVerifyDto = {code: verificationCode!, email: accountCredentials.email};

			await agent
				.post('/auth/signup/verify')
				.send(payload)
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_VERIFICATION_SUCCESS);
				});

			const accountResponse = await agent.get('/accounts/me').expect(200);
			expect(accountResponse.body.isEmailVerified).toBe(true);
		});

		it('should verify email with resend code (authenticated)', async () => {
			await agent.post('/auth/signup/resend').send().expect(200);

			const resendEmail = await findEmailByRecipient(accountCredentials.email, mailpitApiUrl);
			const resendCode = extractVerificationCode(resendEmail?.Text);
			expect(resendCode).toBeDefined();
			expect(resendCode).toMatch(/^\d{6}$/);
			expect(resendCode).not.toEqual(verificationCode);

			const payload: EmailVerifyDto = {
				code: resendCode!,
				email: accountCredentials.email,
			};

			await agent
				.post('/auth/signup/verify')
				.send(payload)
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_VERIFICATION_SUCCESS);
				});

			const meResponse = await agent.get('/accounts/me').expect(200);
			expect(meResponse.body.isEmailVerified).toBe(true);
		});

		it('should fail with 400 Bad Request for invalid code', async () => {
			const payload: EmailVerifyDto = {code: '000000', email: accountCredentials.email};

			await request(httpServer)
				.post('/auth/signup/verify')
				.send(payload)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_INVALID_TOKEN);
				});
		});

		it('should fail with 400 Bad Request if email is already verified', async () => {
			const payload: EmailVerifyDto = {code: verificationCode!, email: accountCredentials.email};

			await request(httpServer).post('/auth/signup/verify').send(payload).expect(200);

			await request(httpServer)
				.post('/auth/signup/verify')
				.send(payload)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_INVALID_TOKEN);
				});
		});

		it('should fail with 400 Bad Request for malformed code (too short)', async () => {
			await request(httpServer)
				.post('/auth/signup/verify')
				.send({code: '12345'})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/Verification code must be 6 digits/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request for malformed code (non-digit)', async () => {
			await request(httpServer)
				.post('/auth/signup/verify')
				.send({code: 'abcdef'})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/Verification code must be 6 digits/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request for missing code', async () => {
			await request(httpServer)
				.post('/auth/signup/verify')
				.send({})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/code should not be empty/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request for missing email', async () => {
			const payload: Partial<EmailVerifyDto> = {code: verificationCode!};

			await request(httpServer)
				.post('/auth/signup/verify')
				.send(payload)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/email should not be empty/i)]),
					);
				});
		});

		it('should fail with 400 Bad Request for invalid email format', async () => {
			const payload: EmailVerifyDto = {code: verificationCode!, email: 'not-an-email'};

			await request(httpServer)
				.post('/auth/signup/verify')
				.send(payload)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/email must be an email/i)]),
					);
				});
		});
	});
});
