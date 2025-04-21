import {faker} from '@faker-js/faker';
import {INestApplication, ValidationPipe} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Test, TestingModule} from '@nestjs/testing';
import axios from 'axios';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {SignUpDto} from '@core/auth/api/dtos/signup.dto';
import {User} from '@modules/user/user.entity';

import {AppModule} from '../src/app.module';

type MailHogMessage = {
  ID: string;
  To?: {Mailbox: string; Domain: string; Params: any}[];
  Content?: {
    Headers?: {
      Subject?: string[];
      [key: string]: any;
    };
    Body?: string;
    [key: string]: any;
  };
};

type MailHogResponse = {
  total?: number;
  count?: number;
  start?: number;
  items: MailHogMessage[];
};

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let mailhogApiUrl: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(new ValidationPipe({whitelist: true, transform: true}));

    await app.init();

    const configService = moduleFixture.get<ConfigService>(ConfigService);
    const mailhogPort = configService.get<number>('EMAIL_UI_PORT');
    mailhogApiUrl = `http://localhost:${mailhogPort}`;
  });

  beforeEach(async () => {
    await axios.delete(`${mailhogApiUrl}/api/v1/messages`);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/auth/login (POST)', () => {
    let userCredentials: SignUpDto;

    beforeEach(async () => {
      userCredentials = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      await request(app.getHttpServer()).post('/auth/signup').send(userCredentials).expect(201);
    });

    it('should log in with correct credentials', async () => {
      const agent = request.agent(app.getHttpServer());

      const response = await agent
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password,
        })
        .expect(200);

      const user: User = response.body;
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toEqual(userCredentials.email);
      expect(user.name).toEqual(userCredentials.name);
      expect(user.password).toBeUndefined();

      const cookiesHeader = response.headers['set-cookie'];
      expect(cookiesHeader).toBeDefined();

      const sessionCookie = ([] as string[])
        .concat(cookiesHeader || [])
        .find((cookie: string) => cookie.startsWith('session='));

      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toMatch(/HttpOnly/);
      expect(sessionCookie).toMatch(/Path=\//);
      expect(sessionCookie).toMatch(/SameSite=Strict/);
      expect(sessionCookie).toMatch(/Expires=/);

      await agent.get('/users/me').expect(200);
    });

    it('should fail to log in with incorrect password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: 'incorrect-password',
        })
        .expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('should fail to log in with incorrect email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'incorrect@email.com',
          password: userCredentials.password,
        })
        .expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('should fail with 401 Unauthorized if email is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          password: 'password123',
        })
        .expect(401);
    });

    it('should fail with 401 Unauthorized if email is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: '',
          password: 'password123',
        })
        .expect(401);
    });

    it('should fail with 401 Unauthorized if password is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email,
        })
        .expect(401);
    });

    it('should fail with 401 Unauthorized if password is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: '',
        })
        .expect(401);
    });

    it('should fail with 400 Bad Request if email is not a valid email format', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'not-a-valid-email',
          password: 'password123',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/email must be an email/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if password is too short', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: '123',
        })
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

  describe('/auth/logout (POST)', () => {
    let agent: TestAgent;
    let userCredentials: SignUpDto;

    beforeEach(async () => {
      userCredentials = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };

      await request(app.getHttpServer()).post('/auth/signup').send(userCredentials).expect(201);

      agent = request.agent(app.getHttpServer());
      await agent
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password,
        })
        .expect(200);
    });

    it('should log out an authenticated user', async () => {
      await agent.get('/users/me').expect(200);

      const response = await agent
        .post('/auth/logout')
        .send()
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('User logged out.');
        });

      const cookiesHeader = response.headers['set-cookie'];
      expect(cookiesHeader).toBeDefined();

      const sessionCookie = ([] as string[])
        .concat(cookiesHeader || [])
        .find((cookie: string) => cookie.startsWith('session='));

      expect(sessionCookie).toBeDefined();
      console.log(sessionCookie);
      expect(sessionCookie).toMatch(/Max-Age=0|Expires=.*1970/);
      expect(sessionCookie).toMatch(/Path=\//);

      // Verify session is terminated by accessing a protected route
      await agent.get('/users/me').expect(401);
    });

    it('should fail with 401 Unauthorized if user is not logged in', () => {
      return request(app.getHttpServer())
        .post('/auth/logout')
        .send()
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });
  });

  describe('/auth/signup (POST)', () => {
    it('should sign up a new user and send welcome email', async () => {
      const signUpDto: SignUpDto = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };

      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(signUpDto)
        .expect(201);

      expect(response.body?.email).toEqual(signUpDto.email);

      const mailhogResponse = await axios.get<MailHogResponse>(`${mailhogApiUrl}/api/v2/messages`);
      const emails = mailhogResponse?.data?.items;

      expect(emails.length).toBeGreaterThanOrEqual(1);
      const welcomeEmail = emails.find((msg) =>
        msg.To?.some((recipient) => recipient.Mailbox + '@' + recipient.Domain === signUpDto.email),
      );
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
      await request(app.getHttpServer()).post('/auth/signup').send(existingUserDto).expect(201);

      const duplicateSignUpDto = {
        name: faker.person.fullName(),
        email: email,
        password: faker.internet.password({length: 11}),
      };

      return request(app.getHttpServer())
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

      return request(app.getHttpServer())
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
      await request(app.getHttpServer())
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
      await request(app.getHttpServer())
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
      await request(app.getHttpServer())
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
      await request(app.getHttpServer())
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
      await request(app.getHttpServer())
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
});
