import {faker} from '@faker-js/faker';
import {INestApplication} from '@nestjs/common';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {UserUpdateDto} from '@modules/user/api/user-update.dto';
import {User} from '@modules/user/user.entity';

import {
  UNVERIFIED_USER_EMAIL,
  UNVERIFIED_USER_PASSWORD,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from '../../setup/constants';
import {getApp} from '../../setup/e2e.setup';

describe('UserController - /me', () => {
  let httpServer: Server;
  let app: INestApplication;

  beforeAll(async () => {
    app = getApp();
    httpServer = app.getHttpServer();
  });

  describe('/users/me (GET)', () => {
    it('should return the current VERIFIED authenticated user', async () => {
      const agent = request.agent(httpServer);

      await agent
        .post('/auth/login')
        .send({
          email: VERIFIED_USER_EMAIL,
          password: VERIFIED_USER_PASSWORD,
        })
        .expect(200);

      const response = await agent.get('/users/me').expect(200);

      const user: User = response.body;
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toEqual(VERIFIED_USER_EMAIL);
      expect(user.name).toEqual('Verified User');
      expect(user.isEmailVerified).toBe(true);
      expect(user.createdAt).toBeDefined();
      expect(user.password).toBeUndefined();
      expect(user.bankAccounts).toBeUndefined();
    });

    it('should return the current UNVERIFIED authenticated user', async () => {
      const agent = request.agent(httpServer);

      await agent
        .post('/auth/login')
        .send({
          email: UNVERIFIED_USER_EMAIL,
          password: UNVERIFIED_USER_PASSWORD,
        })
        .expect(200);

      const response = await agent.get('/users/me').expect(200);

      const user: User = response.body;
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toEqual(UNVERIFIED_USER_EMAIL);
      expect(user.name).toEqual('Unverified User');
      expect(user.isEmailVerified).toBe(false);
      expect(user.createdAt).toBeDefined();
      expect(user.password).toBeUndefined();
      expect(user.bankAccounts).toBeUndefined();
    });

    it('should return 401 Unauthorized if the user is not authenticated', async () => {
      await request(httpServer).get('/users/me').expect(401);
    });
  });

  describe('/users/me (PATCH)', () => {
    let verifiedAgent: TestAgent;
    let unverifiedAgent: TestAgent;

    beforeAll(async () => {
      verifiedAgent = request.agent(httpServer);
      await verifiedAgent
        .post('/auth/login')
        .send({
          email: VERIFIED_USER_EMAIL,
          password: VERIFIED_USER_PASSWORD,
        })
        .expect(200);

      unverifiedAgent = request.agent(httpServer);
      await unverifiedAgent
        .post('/auth/login')
        .send({
          email: UNVERIFIED_USER_EMAIL,
          password: UNVERIFIED_USER_PASSWORD,
        })
        .expect(200);
    });

    it('should update the name for an authenticated VERIFIED user', async () => {
      const newName = faker.person.fullName();
      const updateDto: UserUpdateDto = {name: newName};

      const patchResponse = await verifiedAgent.patch('/users/me').send(updateDto).expect(200);

      const updatedUser: User = patchResponse.body;
      expect(updatedUser).toBeDefined();
      expect(updatedUser.name).toEqual(newName);
      expect(updatedUser.email).toEqual(VERIFIED_USER_EMAIL);
      expect(updatedUser.isEmailVerified).toBe(true);
      expect(updatedUser.password).toBeUndefined();

      const getResponse = await verifiedAgent.get('/users/me').expect(200);
      expect(getResponse.body.name).toEqual(newName);
    });

    it('should strip disallowed fields and update the name for an authenticated VERIFIED user', async () => {
      const updateDto = {name: 'Valid Name Again', email: 'ignored@mail.com'};

      await verifiedAgent
        .patch('/users/me')
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toEqual('Valid Name Again');
          expect(res.body.email).toEqual(VERIFIED_USER_EMAIL);
        });
    });

    it('should return 403 Forbidden for an UNVERIFIED user', async () => {
      const newName = faker.person.fullName();
      const updateDto: UserUpdateDto = {name: newName};

      await unverifiedAgent
        .patch('/users/me')
        .send(updateDto)
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toMatch(/email not verified/i);
        });
    });

    it('should return 401 Unauthorized if the user is not authenticated', async () => {
      const updateDto: UserUpdateDto = {name: 'Attempt Update'};
      await request(httpServer).patch('/users/me').send(updateDto).expect(401);
    });

    it('should return 400 Bad Request if name is missing', async () => {
      await verifiedAgent
        .patch('/users/me')
        .send({})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/name must be a string/i)]),
          );
        });
    });

    it('should return 400 Bad Request if name is empty', async () => {
      const updateDto: Partial<UserUpdateDto> = {name: ''};
      await verifiedAgent
        .patch('/users/me')
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
      const updateDto: UserUpdateDto = {name: longName};
      await verifiedAgent
        .patch('/users/me')
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
      const updateDto = {name: 12345};
      await verifiedAgent
        .patch('/users/me')
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
