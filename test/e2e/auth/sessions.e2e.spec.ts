import {Server} from 'net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {
	ALL_OTHER_SESSIONS_REVOKED,
	CANNOT_REVOKE_CURRENT_SESSION,
	EMAIL_NOT_VERIFIED,
	INVALID_SESSION,
	NO_OTHER_SESSIONS_TO_REVOKE,
	SESSION_REVOKE_SUCCESS,
} from '@modules/auth/api/constants/api-messages.constants';
import {SessionResponseDto} from '@modules/auth/api/dtos/session-response.dto';

import {
	PW_CHANGE_ACCOUNT_EMAIL,
	PW_CHANGE_ACCOUNT_PASSWORD,
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from '../../setup/constants';
import {getApp} from '../../setup/e2e.setup';

describe('AuthController - Sessions', () => {
	let httpServer: Server;

	beforeAll(async () => {
		httpServer = getApp().getHttpServer();
	});

	describe('/auth/sessions (GET)', () => {
		let verifiedAgent1: TestAgent;
		let verifiedAgent2: TestAgent;
		let unverifiedAgent: TestAgent;

		beforeEach(async () => {
			verifiedAgent1 = request.agent(httpServer);
			await verifiedAgent1
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			verifiedAgent2 = request.agent(httpServer);
			await verifiedAgent2
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
				.expect(200);
		});

		it('should return all active sessions, marking the current one', async () => {
			const response = await verifiedAgent1.get('/auth/sessions').expect(200);

			const sessions: SessionResponseDto[] = response.body;
			expect(Array.isArray(sessions)).toBe(true);
			expect(sessions.length).toBeGreaterThanOrEqual(2);

			const currentSessions = sessions.filter((s) => s.isCurrent === true);
			expect(currentSessions).toHaveLength(1);
			const currentSession = currentSessions[0];
			expect(currentSession).toBeDefined();
			expect(currentSession.isCurrent).toBe(true);

			const nonCurrentSessions = sessions.filter((s) => s.isCurrent === false);
			expect(nonCurrentSessions.length).toBeGreaterThanOrEqual(1);
			nonCurrentSessions.forEach((session) => {
				expect(session.isCurrent).toBe(false);
			});

			const expectedSessionStructure = {
				id: expect.any(String),
				ip: expect.any(String),
				userAgent: expect.any(String),
				deviceType: expect.any(String),
				clientDescription: expect.any(String),
				clientLocation: expect.any(String),
				createdAt: expect.any(String),
				lastSeenAt: expect.any(String),
				isCurrent: expect.any(Boolean),
			};

			// Check structure and validity of all returned sessions
			sessions.forEach((session) => {
				expect(session).toEqual(expect.objectContaining(expectedSessionStructure));
				expect(session.id.length).toBeGreaterThan(0);
				expect(Date.parse(session.createdAt)).not.toBeNaN();
				expect(Date.parse(session.lastSeenAt)).not.toBeNaN();
			});

			// Verify making the request with the second agent also works
			const response2 = await verifiedAgent2.get('/auth/sessions').expect(200);
			const sessions2: SessionResponseDto[] = response2.body;
			expect(sessions2.length).toBeGreaterThanOrEqual(2);
			const currentSessions2 = sessions2.filter((s) => s.isCurrent === true);
			expect(currentSessions2).toHaveLength(1);
			// Verify agent 2's current session ID is different
			expect(currentSessions2[0].id).not.toEqual(currentSession.id);
		});

		it('should return 403 Forbidden for an unverified account', async () => {
			await unverifiedAgent
				.get('/auth/sessions')
				.expect(403)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_NOT_VERIFIED);
				});
		});

		it('should return 401 Unauthorized if the user is not logged in', async () => {
			await request(httpServer)
				.get('/auth/sessions')
				.expect(401)
				.expect((res) => {
					expect(res.body.message).toBe('Unauthorized');
				});
		});
	});

	describe('/auth/sessions (DELETE)', () => {
		let verifiedAgent1: TestAgent;
		let verifiedAgent2: TestAgent;
		let verifiedAgent3: TestAgent;
		let unverifiedAgent: TestAgent;
		let currentSessionIdAgent1: string | null = null;

		beforeEach(async () => {
			verifiedAgent1 = request.agent(httpServer);
			await verifiedAgent1
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			verifiedAgent2 = request.agent(httpServer);
			await verifiedAgent2
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			verifiedAgent3 = request.agent(httpServer);
			await verifiedAgent3
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			// Get current session ID for agent 1
			const response = await verifiedAgent1.get('/auth/sessions').expect(200);
			const sessions: SessionResponseDto[] = response.body;
			const currentSession = sessions.find((s) => s.isCurrent);
			expect(currentSession).toBeDefined();
			currentSessionIdAgent1 = currentSession!.id;
		});

		it('should revoke all other sessions for the authenticated account', async () => {
			const initialResponse = await verifiedAgent1.get('/auth/sessions').expect(200);
			const initialSessions: SessionResponseDto[] = initialResponse.body;
			expect(initialSessions.length).toBeGreaterThanOrEqual(3);

			await verifiedAgent1
				.delete('/auth/sessions')
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(ALL_OTHER_SESSIONS_REVOKED);
				});

			// Verify only agent 1's session remains
			const finalResponse = await verifiedAgent1.get('/auth/sessions').expect(200);
			const finalSessions: SessionResponseDto[] = finalResponse.body;
			expect(finalSessions).toHaveLength(1);
			expect(finalSessions[0].isCurrent).toBe(true);
			expect(finalSessions[0].id).toEqual(currentSessionIdAgent1);

			await verifiedAgent2.get('/accounts/me').expect(401);
			await verifiedAgent3.get('/accounts/me').expect(401);
		});

		it('should return success message and not change session count when only the current session exists', async () => {
			const agent = request.agent(httpServer);
			await agent
				.post('/auth/login')
				.send({email: PW_CHANGE_ACCOUNT_EMAIL, password: PW_CHANGE_ACCOUNT_PASSWORD})
				.expect(200);

			const initialResponse = await agent.get('/auth/sessions').expect(200);
			expect(initialResponse.body).toHaveLength(1);
			expect(initialResponse.body[0].isCurrent).toBe(true);
			const currentId = initialResponse.body[0].id;

			await agent
				.delete('/auth/sessions')
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toBe(NO_OTHER_SESSIONS_TO_REVOKE);
				});

			const finalResponse = await agent.get('/auth/sessions').expect(200);
			expect(finalResponse.body).toHaveLength(1);
			expect(finalResponse.body[0].id).toEqual(currentId);
		});

		it('should fail with 403 Forbidden if the account is not email-verified', async () => {
			await unverifiedAgent
				.delete('/auth/sessions')
				.expect(403)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_NOT_VERIFIED);
				});
		});

		it('should fail with 401 Unauthorized if the user is not logged in', async () => {
			await request(httpServer).delete('/auth/sessions').expect(401);
		});
	});

	describe('/auth/sessions/:sessionId (DELETE)', () => {
		let verifiedAgent1: TestAgent; // Agent making the revoke request
		let verifiedAgent2: TestAgent; // Agent whose session will be revoked
		let unverifiedAgent: TestAgent;
		let sessionToRevokeId: string | null = null;
		let currentSessionId: string | null = null;

		beforeEach(async () => {
			// Login verified account - Session 1
			verifiedAgent1 = request.agent(httpServer);
			await verifiedAgent1
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			// Login verified account - Session 2
			verifiedAgent2 = request.agent(httpServer);
			await verifiedAgent2
				.post('/auth/login')
				.send({email: VERIFIED_ACCOUNT_EMAIL, password: VERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({email: UNVERIFIED_ACCOUNT_EMAIL, password: UNVERIFIED_ACCOUNT_PASSWORD})
				.expect(200);

			// Get sessions using agent 1 to identify IDs
			const response = await verifiedAgent1.get('/auth/sessions').expect(200);
			const sessions: SessionResponseDto[] = response.body;

			const currentSession = sessions.find((s) => s.isCurrent);
			const nonCurrentSession = sessions.find((s) => !s.isCurrent);

			// Ensure we have two sessions
			expect(currentSession).toBeDefined();
			expect(nonCurrentSession).toBeDefined();

			currentSessionId = currentSession!.id;
			sessionToRevokeId = nonCurrentSession!.id;
		});

		it('should revoke another session for the authenticated account', async () => {
			expect(sessionToRevokeId).toBeDefined();

			await verifiedAgent1
				.delete(`/auth/sessions/${sessionToRevokeId}`)
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toEqual(SESSION_REVOKE_SUCCESS);
				});

			// Verify the session is gone
			const responseAfter = await verifiedAgent1.get('/auth/sessions').expect(200);
			const sessionsAfter: SessionResponseDto[] = responseAfter.body;
			const revokedSession = sessionsAfter.find((s) => s.id === sessionToRevokeId);
			expect(revokedSession).toBeUndefined();
			// Ensure the current session still exists
			expect(sessionsAfter.some((s) => s.id === currentSessionId)).toBe(true);
		});

		it('should fail with 409 Conflict when trying to revoke the current session', async () => {
			expect(currentSessionId).toBeDefined();

			await verifiedAgent1
				.delete(`/auth/sessions/${currentSessionId}`)
				.expect(409)
				.expect((res) => {
					expect(res.body.message).toBe(CANNOT_REVOKE_CURRENT_SESSION);
				});
		});

		it('should fail with 404 Not Found for a non-existent session ID', async () => {
			const nonExistentId = '00000000000000000000000000000000'; // 32 chars long

			await verifiedAgent1
				.delete(`/auth/sessions/${nonExistentId}`)
				.expect(404)
				.expect((res) => {
					expect(res.body.message).toBe(INVALID_SESSION);
				});
		});

		it('should fail with 400 Bad Request for an invalid session ID format (too short)', async () => {
			const invalidId = 'invalid-id';

			await verifiedAgent1
				.delete(`/auth/sessions/${invalidId}`)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/sessionId must be longer than or equal to 32 characters/i),
						]),
					);
				});
		});

		it('should fail with 400 Bad Request for an invalid session ID format (too long)', async () => {
			const invalidId = 'a'.repeat(33); // 33 chars long

			await verifiedAgent1
				.delete(`/auth/sessions/${invalidId}`)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/sessionId must be shorter than or equal to 32 characters/i),
						]),
					);
				});
		});

		it('should fail with 403 Forbidden if the account is not email-verified', async () => {
			await unverifiedAgent
				.delete(`/auth/sessions/${sessionToRevokeId}`)
				.expect(403)
				.expect((res) => {
					expect(res.body.message).toBe(EMAIL_NOT_VERIFIED);
				});
		});

		it('should fail with 401 Unauthorized if the user is not logged in', async () => {
			expect(sessionToRevokeId).toBeDefined();

			await request(httpServer)
				.delete(`/auth/sessions/${sessionToRevokeId}`)
				.expect(401)
				.expect((res) => {
					expect(res.body.message).toBe('Unauthorized');
				});
		});
	});
});
