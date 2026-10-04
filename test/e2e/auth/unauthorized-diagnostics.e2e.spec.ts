import {Logger} from '@nestjs/common';
import {Server} from 'node:net';
import request from 'supertest';

import {VERIFIED_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_PASSWORD} from '../../../scripts/seed-data/seed.constants';
import {getApp, getSessionCookie} from '../../setup/e2e.setup';

const MOBILE_UA =
	'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

describe('AuthGuard - rejected session diagnostics', () => {
	let httpServer: Server;
	let warn: jest.SpyInstance;

	beforeAll(() => {
		httpServer = getApp().getHttpServer();
	});

	beforeEach(() => {
		warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
	});

	afterEach(() => {
		warn.mockRestore();
	});

	async function logIn() {
		const response = await request(httpServer)
			.post('/auth/login')
			.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
			.expect(200);
		const cookie = getSessionCookie(response)!.split(';')[0];
		return {cookie, value: decodeURIComponent(cookie.split('=')[1])};
	}

	function loggedReasons() {
		return warn.mock.calls.map(([message]) => String(message));
	}

	it('logs that no session cookie was sent', async () => {
		await request(httpServer).get('/accounts/me').set('User-Agent', MOBILE_UA).expect(401);

		expect(loggedReasons()).toEqual([
			expect.stringMatching(/^Rejected session: reason=no_cookie route=GET \/accounts\/me client=.*Android 10$/),
		]);
	});

	it('logs a cookie whose signature does not verify, without the cookie value', async () => {
		const {value} = await logIn();
		const tampered = `session=${encodeURIComponent(`${value.slice(0, -2)}xx`)}`;

		await request(httpServer).get('/accounts/me').set('Cookie', tampered).expect(401);

		expect(loggedReasons()).toEqual([expect.stringContaining('reason=invalid_signature route=GET /accounts/me')]);
		expect(loggedReasons().join()).not.toContain(value.slice(2, 20));
	});

	it('logs a validly signed cookie whose session no longer exists, without the session id', async () => {
		const {cookie, value} = await logIn();
		await request(httpServer).post('/auth/logout').set('Cookie', cookie).expect(200);
		warn.mockClear();

		await request(httpServer).get('/accounts/me').set('Cookie', cookie).expect(401);

		expect(loggedReasons()).toEqual([expect.stringContaining('reason=unknown_session route=GET /accounts/me')]);
		const sessionId = value.slice(2, value.lastIndexOf('.'));
		expect(loggedReasons().join()).not.toContain(sessionId);
	});

	it('logs nothing for an authenticated or public request', async () => {
		const {cookie} = await logIn();
		await request(httpServer).get('/accounts/me').set('Cookie', cookie).expect(200);
		await request(httpServer).get('/health').expect(200);

		expect(loggedReasons()).toEqual([]);
	});
});
