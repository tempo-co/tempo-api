import {ConflictException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Request} from 'express';
import * as geoip from 'fast-geoip';
import Redis from 'ioredis';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {IResult, UAParser} from 'ua-parser-js';

import {ConfigurationService} from '@core/config/config.service';
import {REDIS} from '@core/redis/redis.constants';
import {Account} from '@modules/account/account.entity';

import {
	ALL_OTHER_SESSIONS_REVOKED,
	CANNOT_REVOKE_CURRENT_SESSION,
	INVALID_SESSION,
	NO_OTHER_SESSIONS_TO_REVOKE,
	SESSION_REVOKE_SUCCESS,
} from './api-messages.constants';
import {AuthenticatedSession} from './authenticated-session.interface';
import {SessionResponseDto, UNKNOWN} from './session-response.dto';

@Injectable()
export class SessionService {
	private readonly REDIS_KEY: string;

	constructor(
		@Inject(REDIS) private readonly redisClient: Redis,
		private readonly configService: ConfigurationService,
	) {
		this.REDIS_KEY = this.configService.get('SESSION_REDIS_KEY');
	}

	/**
	 * Gets metadata of all active sessions for an account.
	 * Uses the Redis SCAN command to iterate through session keys in batches.
	 *
	 * NOTE: This implementation does not scale well.
	 */
	async getSessions(accountId: Account['id'], currentSessionId: string | null) {
		const sessions: SessionResponseDto[] = [];

		const scanBatchSize = '250';
		let cursor = '0';
		const prefix = `${this.REDIS_KEY}:`;
		const matchPattern = `${prefix}*`;

		while (true) {
			const reply = await this.redisClient.scan(cursor, 'MATCH', matchPattern, 'COUNT', scanBatchSize);

			cursor = reply[0];
			const keys = reply[1];

			if (keys.length > 0) {
				const sessionDataStrings = await this.redisClient.mget(keys);

				for (let i = 0; i < keys.length; i++) {
					const key = keys[i];
					const sessionDataString = sessionDataStrings[i];
					if (!sessionDataString) continue;

					const sessionData: AuthenticatedSession = JSON.parse(sessionDataString);

					if (sessionData?.passport?.user !== accountId) continue;
					const sessionId = key.substring(prefix.length);

					sessions.push(
						new SessionResponseDto({
							id: sessionId,
							...sessionData.metadata,
							isCurrent: sessionId === currentSessionId,
						}),
					);
				}
			}

			if (cursor === '0') break;
		}
		return sessions;
	}

	/** Revokes an account's active session. */
	async revokeSession(accountId: Account['id'], currentSessionId: string, sessionIdToRevoke: string) {
		if (sessionIdToRevoke === currentSessionId) {
			throw new ConflictException(CANNOT_REVOKE_CURRENT_SESSION);
		}

		const sessionKey = `${this.REDIS_KEY}:${sessionIdToRevoke}`;
		const sessionDataString = await this.redisClient.get(sessionKey);
		if (!sessionDataString) {
			throw new NotFoundException(INVALID_SESSION);
		}

		const sessionData: AuthenticatedSession = JSON.parse(sessionDataString);
		if (sessionData?.passport?.user !== accountId) {
			throw new NotFoundException(INVALID_SESSION);
		}

		await this.redisClient.del(sessionKey);
		return {message: SESSION_REVOKE_SUCCESS};
	}

	/** Revokes all sessions of an account except the current one. */
	async revokeAllOtherSessions(accountId: Account['id'], currentSessionId: string | null) {
		const allSessions = await this.getSessions(accountId, currentSessionId);

		const sessionsToRevoke = allSessions.filter((session) => !session.isCurrent);
		if (sessionsToRevoke.length === 0) {
			return {message: NO_OTHER_SESSIONS_TO_REVOKE};
		}

		const pipeline = this.redisClient.pipeline();
		for (const session of sessionsToRevoke) {
			const sessionKey = `${this.REDIS_KEY}:${session.id}`;
			pipeline.del(sessionKey);
		}
		await pipeline.exec();

		return {message: ALL_OTHER_SESSIONS_REVOKED};
	}

	/** Initializes the metadata (ip, user agent, timestamps) on a session. */
	async initializeSessionMetadata(request: Request) {
		if (!request.session) return;

		const session: AuthenticatedSession = request.session;
		if (!session.passport?.user || session.metadata) return;

		const userAgent = request.headers['user-agent'];
		const now = new Date().toISOString();

		const {name, deviceType, browserType} = this._parseUserAgent(userAgent);
		const location = await this._getLocationByIp(request.ip);

		session.metadata = {
			ip: request.ip ?? UNKNOWN,
			deviceType,
			browserType,
			name,
			createdAt: now,
			lastSeenAt: now,
			location,
		};
	}

	/**
	 * Explains why a request has no authenticated session, for logs. Never returns cookie values or
	 * session IDs. Must run after the session middleware has loaded (or failed to load) the session.
	 */
	describeRejectedSession(request: Request) {
		const client = this._parseUserAgent(request.headers['user-agent']).name;
		const value = this._readSessionCookie(request.headers.cookie);
		if (value === undefined) return {reason: 'no_cookie', client};

		const sessionId = this._unsignSessionCookie(value);
		if (sessionId === undefined) return {reason: 'invalid_signature', client};
		// express-session replaces the ID when the store has no session for it (expired, revoked or logged out).
		if (request.sessionID !== sessionId) return {reason: 'unknown_session', client};
		return {reason: 'unauthenticated_session', client};
	}

	/** Updates the `lastSeenAt` timestamp in the session metadata. */
	updateLastSeen(session: AuthenticatedSession) {
		if (!session.passport?.user || !session.metadata) return;
		session.metadata.lastSeenAt = new Date().toISOString();
	}

	/** Returns the first session cookie's decoded value, as express-session reads it. */
	private _readSessionCookie(header?: string) {
		const name = this.configService.get('SESSION_COOKIE_NAME');
		for (const part of header?.split(';') ?? []) {
			const separator = part.indexOf('=');
			if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
			try {
				return decodeURIComponent(part.slice(separator + 1).trim());
			} catch {
				return part.slice(separator + 1).trim();
			}
		}
		return undefined;
	}

	/** Verifies an express-session cookie value (`s:<id>.<hmac>`) and returns its session ID. */
	private _unsignSessionCookie(value: string) {
		const separator = value.lastIndexOf('.');
		if (!value.startsWith('s:') || separator < 2) return undefined;

		const sessionId = value.slice(2, separator);
		const expected = Buffer.from(
			createHmac('sha256', this.configService.get('SESSION_SECRET'))
				.update(sessionId)
				.digest('base64')
				.replace(/=+$/, ''),
		);
		const actual = Buffer.from(value.slice(separator + 1));
		return actual.length === expected.length && timingSafeEqual(actual, expected) ? sessionId : undefined;
	}

	/** Parses a user agent to summarize the client environment (OS, browser, device type). */
	private _parseUserAgent(userAgent?: string) {
		if (!userAgent) {
			return {
				name: UNKNOWN,
				deviceType: UNKNOWN,
				browserType: UNKNOWN,
			};
		}

		const parser = new UAParser(userAgent);
		const result: IResult = parser.getResult();

		const browserName = result.browser?.name;
		const osName = result.os?.name;
		const osVersion = result.os?.version;

		const deviceType = result.device?.type ?? 'desktop';
		const browserType = browserName ?? UNKNOWN;

		const osPart = osName ? `${osName}${osVersion ? ` ${osVersion}` : ''}` : '';
		const nameParts = [browserName, osPart].filter(Boolean);
		let name: string;

		switch (nameParts.length) {
			case 2:
				name = `${nameParts[0]} on ${nameParts[1]}`;
				break;
			case 1:
				name = nameParts[0]!;
				break;
			default:
				name = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
				if (!name) name = UNKNOWN;
				break;
		}

		return {name, deviceType, browserType};
	}

	/** Attempts to look up the geolocation for a given IP address. */
	private async _getLocationByIp(ip?: string) {
		if (!ip) return UNKNOWN;
		if (this._isLocalhostIp(ip)) return 'Localhost';

		try {
			const geoData = await geoip.lookup(ip);
			return this._formatGeoData(geoData);
		} catch {
			return UNKNOWN;
		}
	}

	/** Formats geolocation data into a readable string. */
	private _formatGeoData(geoData: Awaited<ReturnType<typeof geoip.lookup>>) {
		if (!geoData) return UNKNOWN;

		const {city, region, country} = geoData;

		if (city && country) return `${city}, ${country}`;
		if (region && country) return `${region}, ${country}`;

		const parts = [city, region, country].filter(Boolean);
		return parts.length > 0 ? parts.join(', ') : UNKNOWN;
	}

	/** Checks if an IP is a localhost address. */
	private _isLocalhostIp(ip: string) {
		const LOCALHOST_REGEX = /^(?:127(?:\.\d{1,3}){3}|::1|0:0:0:0:0:0:0:1|::ffff:127(?:\.\d{1,3}){3})$/;
		return LOCALHOST_REGEX.test(ip);
	}
}
