import {faker} from '@faker-js/faker';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {ConfigurationService} from '@core/config/config.service';
import {SignUpDto} from '@modules/auth/api/dtos/signup.dto';

import {
  UNVERIFIED_USER_EMAIL,
  UNVERIFIED_USER_PASSWORD,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from '../../setup/constants';
import {getApp} from '../../setup/e2e.setup';
import {clearEmails, extractVerificationCode, findEmailByRecipient} from '../../utils/email.util';

describe('AuthController - Signup', () => {
  let mailhogApiUrl: string;
  let httpServer: any;

  beforeAll(async () => {
    const app = getApp();
    mailhogApiUrl = app.get(ConfigurationService).get('EMAIL_UI_URL');
    httpServer = app.getHttpServer();
  });

  beforeEach(async () => {
    await clearEmails(mailhogApiUrl);
  });

  describe('/auth/signup (POST)', () => {
    it('should sign up a new user and send welcome email', async () => {
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

      const welcomeEmail = await findEmailByRecipient(signUpDto.email, mailhogApiUrl);
      expect(welcomeEmail).toBeDefined();

      const recipientEmail = welcomeEmail?.To?.[0]?.Mailbox + '@' + welcomeEmail?.To?.[0]?.Domain;
      const subject = welcomeEmail?.Content?.Headers?.Subject?.[0];
      const body = welcomeEmail?.Content?.Body;

      expect(recipientEmail).toEqual(signUpDto.email);
      expect(subject).toContain('Welcome to Flair');
      expect(subject).toContain('is your verification code');
      expect(body).toContain(signUpDto.name);
      expect(body).toMatch(/Or use the[\s\S]*?following code:\s*(\d{6})/i);
    });

    it('should fail with 409 Conflict if email is already in use', async () => {
      const email = faker.internet.email();
      const existingUserDto = {
        name: faker.person.fullName(),
        email: email,
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer).post('/auth/signup').send(existingUserDto).expect(201);

      const duplicateSignUpDto = {
        name: faker.person.fullName(),
        email: email,
        password: faker.internet.password({length: 11}),
      };

      return request(httpServer)
        .post('/auth/signup')
        .send(duplicateSignUpDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toMatch(/email.*already in use/i);
        });
    });

    it('should fail with 400 Bad Request if password is too short', async () => {
      const signUpDto = {
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
      const signUpDto = {
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
      const signUpDto = {
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
      const signUpDto = {
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
      const signUpDto = {
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
      const signUpDto = {
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
        .send({email: UNVERIFIED_USER_EMAIL, password: UNVERIFIED_USER_PASSWORD})
        .expect(200);

      verifiedAgent = request.agent(httpServer);
      await verifiedAgent
        .post('/auth/login')
        .send({email: VERIFIED_USER_EMAIL, password: VERIFIED_USER_PASSWORD})
        .expect(200);

      await clearEmails(mailhogApiUrl);
    });

    it('should send a new verification email for an unverified user', async () => {
      await unverifiedAgent
        .post('/auth/signup/resend')
        .send()
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Verification email sent.');
        });

      const verificationEmail = await findEmailByRecipient(UNVERIFIED_USER_EMAIL, mailhogApiUrl);
      expect(verificationEmail).toBeDefined();

      const recipientEmail =
        verificationEmail?.To?.[0]?.Mailbox + '@' + verificationEmail?.To?.[0]?.Domain;
      const subject = verificationEmail?.Content?.Headers?.Subject?.[0];
      const body = verificationEmail?.Content?.Body;

      expect(recipientEmail).toEqual(UNVERIFIED_USER_EMAIL);
      expect(subject).toContain('is your verification code');
      expect(body).toMatch(/Or use the[\s\S]*?following code:\s*(\d{6})/i);
    });

    it('should fail with 400 Bad Request if the user is already verified', async () => {
      await verifiedAgent
        .post('/auth/signup/resend')
        .send()
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Email is already verified/i);
        });

      const email = await findEmailByRecipient(VERIFIED_USER_EMAIL, mailhogApiUrl);
      expect(email).toBeUndefined();
    });

    it('should fail with 401 Unauthorized if the user is not logged in', async () => {
      await request(httpServer)
        .post('/auth/signup/resend')
        .send()
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });
  });

  describe('/auth/signup/verify (POST)', () => {
    let verificationCode: string | null;
    let userCredentials: SignUpDto;
    let agent: TestAgent;

    beforeEach(async () => {
      userCredentials = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer).post('/auth/signup').send(userCredentials).expect(201);

      const welcomeEmail = await findEmailByRecipient(userCredentials.email, mailhogApiUrl);
      verificationCode = extractVerificationCode(welcomeEmail?.Content?.Body);
      expect(verificationCode).toBeDefined();
      expect(verificationCode).toMatch(/^\d{6}$/);

      agent = request.agent(httpServer);
      await agent.post('/auth/login').send(userCredentials).expect(200);

      await clearEmails(mailhogApiUrl);
    });

    it('should verify email with correct code (unauthenticated)', async () => {
      const response = await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: verificationCode})
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Email verified.');
        });

      const cookiesHeader = response.headers['set-cookie'];
      expect(cookiesHeader).toBeDefined();
      const sessionCookie = ([] as string[])
        .concat(cookiesHeader || [])
        .find((cookie: string) => cookie.startsWith('session='));
      expect(sessionCookie).toBeDefined();

      const agent = request.agent(httpServer);
      await agent.post('/auth/login').send(userCredentials).expect(200);

      const meResponse = await agent.get('/users/me').expect(200);
      expect(meResponse.body.isEmailVerified).toBe(true);
    });

    it('should verify email with correct code (authenticated)', async () => {
      await agent
        .post('/auth/signup/verify')
        .send({code: verificationCode})
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Email verified.');
        });

      const userRes = await agent.get('/users/me').expect(200);
      expect(userRes.body.isEmailVerified).toBe(true);
    });

    it('should verify email with resend code (authenticated)', async () => {
      await agent.post('/auth/signup/resend').send().expect(200);

      const resendEmail = await findEmailByRecipient(userCredentials.email, mailhogApiUrl);
      const resendCode = extractVerificationCode(resendEmail?.Content?.Body);
      expect(resendCode).toBeDefined();
      expect(resendCode).toMatch(/^\d{6}$/);
      expect(resendCode).not.toEqual(verificationCode);

      await agent
        .post('/auth/signup/verify')
        .send({code: resendCode})
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Email verified.');
        });

      const meResponse = await agent.get('/users/me').expect(200);
      expect(meResponse.body.isEmailVerified).toBe(true);
    });

    it('should fail with 400 Bad Request for invalid code', async () => {
      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: '000000'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
        });
    });

    it('should fail with 400 Bad Request if trying to verify an already verified email', async () => {
      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: verificationCode})
        .expect(200);

      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: verificationCode})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
        });

      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: '654321'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
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
  });
});
