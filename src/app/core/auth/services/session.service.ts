import {REDIS} from '@config/redis/redis.constants';
import {ConflictException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Request} from 'express';
import {RedisClientType} from 'redis';
import {IResult, UAParser} from 'ua-parser-js';

import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {SessionDto} from '../api/dtos/session.dto';
import {AuthenticatedSession} from './authenticated-session.interface';

@Injectable()
export class SessionService {
  private readonly REDIS_KEY: string;

  constructor(
    @Inject(REDIS) private readonly redisClient: RedisClientType,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    this.REDIS_KEY = this.configService.get('SESSION_REDIS_KEY') as string;
  }

  /**
   * Gets metadata of all active sessions for a user.
   * Uses the Redis SCAN command to iterate through session keys in batches.
   *
   * NOTE: This implementation does not scale well.
   */
  async getSessions(userId: User['id'], currentSessionId: string) {
    const userSessions: SessionDto[] = [];
    const scanBatchSize = 250;
    let cursor: number = 0;
    const prefix = `${this.REDIS_KEY}:`;

    while (true) {
      const reply = await this.redisClient.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: scanBatchSize,
      });

      cursor = reply.cursor;
      const keys = reply.keys;

      if (keys.length > 0) {
        const sessionDataStrings = await this.redisClient.mGet(keys);

        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const sessionDataString = sessionDataStrings[i];
          if (!sessionDataString) continue;

          const sessionData: AuthenticatedSession = JSON.parse(sessionDataString);

          if (sessionData?.passport?.user !== userId) continue;
          const sessionId = key.substring(prefix.length);

          userSessions.push({
            id: sessionId,
            ip: sessionData.metadata?.ip,
            userAgent: sessionData.metadata?.userAgent,
            createdAt: sessionData.metadata?.createdAt ?? new Date(0).toISOString(),
            lastSeen: sessionData.metadata?.lastSeen ?? new Date(0).toISOString(),
            isCurrent: sessionId === currentSessionId,
          });
        }
      }

      if (cursor === 0) break;
    }

    userSessions.sort((a, b) => {
      const isCurrentSortOrder = Number(b.isCurrent) - Number(a.isCurrent);
      if (isCurrentSortOrder !== 0) {
        return isCurrentSortOrder;
      }
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });

    return userSessions;
  }

  /** Revokes a user's active session. */
  async revokeSession(
    currentUser: User,
    password: User['password'],
    currentSessionId: string,
    sessionIdToRevoke: string,
  ) {
    await this.userService.verifyPassword(currentUser.password, password);

    if (sessionIdToRevoke === currentSessionId) {
      throw new ConflictException('Cannot revoke the current session. Log out instead.');
    }

    const sessionKey = `${this.REDIS_KEY}:${sessionIdToRevoke}`;
    const sessionDataString = await this.redisClient.get(sessionKey);
    if (!sessionDataString) {
      throw new NotFoundException(`Session not found or expired.`);
    }

    const sessionData: AuthenticatedSession = JSON.parse(sessionDataString);
    if (sessionData?.passport?.user !== currentUser.id) {
      throw new NotFoundException(`Session not found or expired.`);
    }

    await this.redisClient.del(sessionKey);
    return {message: 'Session revoked.'};
  }

  /** Initializes the metadata (ip, user agent, timestamps) on a session. */
  initializeSessionMetadata(request: Request) {
    if (!request.session) {
      return;
    }
    const session: AuthenticatedSession = request.session;

    if (!session.passport?.user || session.metadata) {
      return;
    }

    const now = new Date().toISOString();
    const userAgent = request.headers['user-agent'];
    session.metadata = {
      ip: request.ip ?? 'unknown',
      userAgent: userAgent ?? 'unknown',
      clientDescription: this.getClientDescription(userAgent),
      createdAt: now,
      lastSeen: now,
    };
  }

  /** Updates the `lastSeen` timestamp in the session metadata */
  updateLastSeen(session: AuthenticatedSession) {
    if (!session.passport?.user || !session.metadata) {
      return;
    }
    session.metadata.lastSeen = new Date().toISOString();
  }

  /** Formats a session's user agent into a readable string. */
  getClientDescription(userAgent: string | undefined) {
    const trimmedUserAgent = userAgent?.trim();
    if (!trimmedUserAgent || trimmedUserAgent.toLowerCase() === 'unknown') {
      return 'Unknown device';
    }

    const parser = new UAParser(trimmedUserAgent);
    const result: IResult = parser.getResult();

    const browserName = result.browser?.name;
    const osName = result.os?.name;
    const osVersion = result.os?.version;
    const deviceType = result.device?.type;

    let osPart = '';

    if (osName) {
      osPart = osVersion ? `${osName} ${osVersion}` : osName;
    }
    if (browserName && osPart) return `${browserName} on ${osPart}`;
    if (browserName) return browserName;
    if (osPart) return osPart;

    if (deviceType) {
      const capitalizedDeviceType = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
      return `Device type: ${capitalizedDeviceType}`;
    }
    return 'Unknown device';
  }
}
