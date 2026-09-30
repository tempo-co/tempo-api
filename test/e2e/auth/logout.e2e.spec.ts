import {Server} from 'node:net';

import {LOGOUT_SUCCESS} from '@modules/auth/api/constants/api-messages.constants';

import {VERIFIED_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_PASSWORD} from '../../../scripts/seed-data/seed.constants';
import {getApp, getSessionCookie, loginAgent} from '../../setup/e2e.setup';

describe('AuthController - Logout', () => {
	let httpServer: Server;

	beforeAll(async () => {
		httpServer = getApp().getHttpServer();
	});

	describe('POST /auth/logout', () => {
		it('should log out an authenticated account', async () => {
			const agent = await loginAgent(httpServer, VERIFIED_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_PASSWORD);
			await agent.get('/accounts/me').expect(200);

			const response = await agent.post('/auth/logout').send().expect(200);
			expect(response.body.message).toEqual(LOGOUT_SUCCESS);

			const sessionCookie = getSessionCookie(response);
			expect(sessionCookie).toMatch(/Max-Age=0|Expires=.*1970/);
			expect(sessionCookie).toMatch(/Path=\//);

			await agent.get('/accounts/me').expect(401);
		});
	});
});
