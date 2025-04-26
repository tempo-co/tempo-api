import {faker} from '@faker-js/faker';
import request from 'supertest';

import {ChangePasswordDto} from '@modules/auth/api/dtos/change-password.dto';

import {
  PW_CHANGE_USER_EMAIL,
  PW_CHANGE_USER_PASSWORD,
  UNVERIFIED_USER_EMAIL,
  UNVERIFIED_USER_PASSWORD,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from '../setup/constants';
import {getApp} from '../setup/e2e.setup';

describe('AuthController - Change password', () => {
  let httpServer: any;

  beforeAll(() => {
    const app = getApp();
    httpServer = app.getHttpServer();
  });

  describe('POST /auth/change-password', () => {
    it('should change password for logged-in user and allow login with new password', async () => {
      const agent = request.agent(httpServer);
      await agent
        .post('/auth/login')
        .send({
          email: PW_CHANGE_USER_EMAIL,
          password: PW_CHANGE_USER_PASSWORD,
        })
        .expect(200);

      const newPassword = faker.internet.password({length: 12});
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: PW_CHANGE_USER_PASSWORD,
        newPassword: newPassword,
      };

      await agent
        .post('/auth/change-password')
        .send(changePasswordDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Password changed.');
        });

      await agent.post('/auth/logout').expect(200);

      // Old password fails login
      await request(httpServer)
        .post('/auth/login')
        .send({email: PW_CHANGE_USER_EMAIL, password: PW_CHANGE_USER_PASSWORD})
        .expect(401);

      // New password succeeds login
      await request(httpServer)
        .post('/auth/login')
        .send({email: PW_CHANGE_USER_EMAIL, password: newPassword})
        .expect(200);
    });

    it('should fail with 401 Unauthorized if current password is incorrect', async () => {
      const agent = request.agent(httpServer);
      await agent
        .post('/auth/login')
        .send({
          email: VERIFIED_USER_EMAIL,
          password: VERIFIED_USER_PASSWORD,
        })
        .expect(200);

      const changePasswordDto: ChangePasswordDto = {
        currentPassword: 'wrong-current-password',
        newPassword: faker.internet.password({length: 12}),
      };

      await agent.post('/auth/change-password').send(changePasswordDto).expect(401);
    });

    it('should fail with 403 Forbidden when unverified user tries to change password', async () => {
      const unverifiedAgent = request.agent(httpServer);
      await unverifiedAgent
        .post('/auth/login')
        .send({email: UNVERIFIED_USER_EMAIL, password: UNVERIFIED_USER_PASSWORD})
        .expect(200);

      const newPassword = faker.internet.password({length: 12});
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: UNVERIFIED_USER_PASSWORD,
        newPassword: newPassword,
      };

      await unverifiedAgent
        .post('/auth/change-password')
        .send(changePasswordDto)
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toMatch(/Email not verified/i);
        });
    });

    it('should fail with 400 Bad Request if new password is too short', async () => {
      const agent = request.agent(httpServer);
      await agent
        .post('/auth/login')
        .send({
          email: VERIFIED_USER_EMAIL,
          password: VERIFIED_USER_PASSWORD,
        })
        .expect(200);

      const changePasswordDto: ChangePasswordDto = {
        currentPassword: VERIFIED_USER_PASSWORD,
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
          email: VERIFIED_USER_EMAIL,
          password: VERIFIED_USER_PASSWORD,
        })
        .expect(200);

      const changePasswordDto: Partial<ChangePasswordDto> = {
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
          email: VERIFIED_USER_EMAIL,
          password: VERIFIED_USER_PASSWORD,
        })
        .expect(200);

      const changePasswordDto: Partial<ChangePasswordDto> = {
        currentPassword: VERIFIED_USER_PASSWORD,
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
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: VERIFIED_USER_PASSWORD,
        newPassword: newPassword,
      };

      await request(httpServer).post('/auth/change-password').send(changePasswordDto).expect(401);
    });
  });
});
