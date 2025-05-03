import {faker} from '@faker-js/faker';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {ConfigurationService} from '@core/config/config.service';
import {EmailChangeDto} from '@modules/auth/api/dtos/email-change.dto';
import {SignUpDto} from '@modules/auth/api/dtos/signup.dto';
import {User} from '@modules/user/user.entity';

import {
  UNVERIFIED_USER_EMAIL,
  UNVERIFIED_USER_PASSWORD,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
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

  describe('/auth/change-email/request (POST)', () => {
    let verifiedAgent: TestAgent;
    let verifiedUserName: string;
    let unverifiedAgent: TestAgent;
    let conflictUserEmail: string;

    beforeAll(async () => {
      conflictUserEmail = faker.internet.email();
      const conflictUserDto: SignUpDto = {
        name: faker.person.fullName(),
        email: conflictUserEmail,
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer).post('/auth/signup').send(conflictUserDto).expect(201);
    });

    beforeEach(async () => {
      verifiedAgent = request.agent(httpServer);
      await verifiedAgent
        .post('/auth/login')
        .send({email: VERIFIED_USER_EMAIL, password: VERIFIED_USER_PASSWORD})
        .expect(200);
      const meResponse = await verifiedAgent.get('/users/me').expect(200);
      verifiedUserName = meResponse.body.name;

      unverifiedAgent = request.agent(httpServer);
      await unverifiedAgent
        .post('/auth/login')
        .send({email: UNVERIFIED_USER_EMAIL, password: UNVERIFIED_USER_PASSWORD})
        .expect(200);

      await clearEmails(mailhogApiUrl);
    });

    it('should send a verification email to the new email address for a verified user', async () => {
      const newEmail = faker.internet.email();
      const emailChangeDto: EmailChangeDto = {
        newEmail: newEmail,
        password: VERIFIED_USER_PASSWORD,
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Verification email sent.');
        });

      const verificationEmail = await findEmailByRecipient(newEmail, mailhogApiUrl);
      expect(verificationEmail).toBeDefined();

      const recipientEmail =
        verificationEmail?.To?.[0]?.Mailbox + '@' + verificationEmail?.To?.[0]?.Domain;
      const subject = verificationEmail?.Content?.Headers?.Subject?.[0];
      const body = verificationEmail?.Content?.Body;
      const code = extractVerificationCode(body);

      expect(recipientEmail).toEqual(newEmail);
      expect(subject).toContain('is your verification code');
      expect(body).toContain(verifiedUserName);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should fail with 401 Unauthorized if the user is not logged in', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: faker.internet.email(),
        password: VERIFIED_USER_PASSWORD,
      };

      await request(httpServer)
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });

    it('should fail with 403 Forbidden if the user email is not verified', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: faker.internet.email(),
        password: UNVERIFIED_USER_PASSWORD,
      };

      await unverifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toMatch(/Email not verified/i);
        });
    });

    it('should fail with 401 Unauthorized if the provided password is incorrect', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: faker.internet.email(),
        password: 'wrong-password',
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });

    it('should fail with 409 Conflict if the new email is already in use', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: conflictUserEmail,
        password: VERIFIED_USER_PASSWORD,
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toMatch(/email is already in use/i);
        });
    });

    it('should fail with 400 Bad Request if newEmail is not a valid email format', async () => {
      const emailChangeDto = {
        newEmail: 'not-an-email',
        password: VERIFIED_USER_PASSWORD,
      };

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
      const emailChangeDto = {
        password: VERIFIED_USER_PASSWORD,
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/newEmail should not be empty/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if password is missing', async () => {
      const emailChangeDto = {
        newEmail: faker.internet.email(),
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/password should not be empty/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if password is too short', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: faker.internet.email(),
        password: '123',
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/password must be longer than or equal to 8 characters/i),
            ]),
          );
        });
    });
  });

  describe('/auth/change-email/verify (POST)', () => {
    let verifiedAgent: TestAgent;
    let verificationCode: string | null;
    let newEmailAddress: string;
    let initialUserEmail: string = VERIFIED_USER_EMAIL;

    const requestChangeAndGetCode = async (agent: TestAgent, password: string) => {
      const requestedNewEmail = faker.internet.email();
      const changeDto: EmailChangeDto = {newEmail: requestedNewEmail, password};
      await agent.post('/auth/change-email/request').send(changeDto).expect(200);

      const emailContent = await findEmailByRecipient(requestedNewEmail, mailhogApiUrl);
      const code = extractVerificationCode(emailContent?.Content?.Body);
      return {code, newEmail: requestedNewEmail};
    };

    beforeEach(async () => {
      verifiedAgent = request.agent(httpServer);
      await verifiedAgent
        .post('/auth/login')
        .send({email: initialUserEmail, password: VERIFIED_USER_PASSWORD})
        .expect(200);

      const result = await requestChangeAndGetCode(verifiedAgent, VERIFIED_USER_PASSWORD);
      verificationCode = result.code;
      newEmailAddress = result.newEmail;
      expect(verificationCode).toBeDefined();
      expect(verificationCode).toMatch(/^\d{6}$/);

      await clearEmails(mailhogApiUrl);
    });

    it('should change the email with a valid code for an authenticated, verified user', async () => {
      const response = await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: verificationCode})
        .expect(200);

      const updatedUser: User = response.body;
      expect(updatedUser).toBeDefined();
      expect(updatedUser.email).toEqual(newEmailAddress);
      expect(updatedUser.isEmailVerified).toBe(true);

      const meResponse = await verifiedAgent.get('/users/me').expect(200);
      expect(meResponse.body.email).toEqual(newEmailAddress);

      initialUserEmail = newEmailAddress;
    });

    it('should fail with 401 Unauthorized if the user is not logged in', async () => {
      await request(httpServer)
        .post('/auth/change-email/verify')
        .send({code: verificationCode})
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });

    it('should fail with 403 Forbidden if the logged in user is not email-verified', async () => {
      const unverifiedAgent = request.agent(httpServer);
      await unverifiedAgent
        .post('/auth/login')
        .send({email: UNVERIFIED_USER_EMAIL, password: UNVERIFIED_USER_PASSWORD})
        .expect(200);

      await unverifiedAgent
        .post('/auth/change-email/verify')
        .send({code: verificationCode ?? '123456'})
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toMatch(/Email not verified/i);
        });
    });

    it('should fail with 400 Bad Request for an invalid code', async () => {
      await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: '000000'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
        });
    });

    it('should fail with 400 Bad Request if the code has already been used', async () => {
      await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: verificationCode})
        .expect(200);

      initialUserEmail = newEmailAddress;

      const agentWithNewEmail = request.agent(httpServer);
      await agentWithNewEmail
        .post('/auth/login')
        .send({email: newEmailAddress, password: VERIFIED_USER_PASSWORD})
        .expect(200);

      await agentWithNewEmail
        .post('/auth/change-email/verify')
        .send({code: verificationCode})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
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
      // 1. User A requests change to targetEmail (done in beforeEach)
      const codeForA = verificationCode;
      const targetEmail = newEmailAddress;
      expect(codeForA).toBeDefined();

      // 2. Create, verify and log in User B
      const userBCredentials: SignUpDto = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer).post('/auth/signup').send(userBCredentials).expect(201);

      const signupEmailB = await findEmailByRecipient(userBCredentials.email, mailhogApiUrl);
      const signupCodeB = extractVerificationCode(signupEmailB?.Content?.Body);
      expect(signupCodeB).toBeDefined();
      await request(httpServer).post('/auth/signup/verify').send({code: signupCodeB}).expect(200);

      const userBAgent = request.agent(httpServer);
      await userBAgent
        .post('/auth/login')
        .send({email: userBCredentials.email, password: userBCredentials.password})
        .expect(200);

      // 3. User B requests change to the same targetEmail and gets their own code
      const changeDtoForB: EmailChangeDto = {
        newEmail: targetEmail,
        password: userBCredentials.password,
      };
      await userBAgent.post('/auth/change-email/request').send(changeDtoForB).expect(200);

      const emailForB = await findEmailByRecipient(targetEmail, mailhogApiUrl);
      const codeForB = extractVerificationCode(emailForB?.Content?.Body);
      expect(codeForB).toBeDefined();
      expect(codeForB).not.toEqual(codeForA);

      // 4. User B successfully verifies their code, taking the targetEmail address
      await userBAgent.post('/auth/change-email/verify').send({code: codeForB}).expect(200);

      // 5. User A now tries to verify their original code for the now-taken email, expect conflict
      await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: codeForA})
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toMatch(/email is already in use/i);
        });

      initialUserEmail = VERIFIED_USER_EMAIL;
    });
  });
});
