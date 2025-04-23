import {ConflictException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Request} from 'express';
import * as geoip from 'fast-geoip';
import Redis from 'ioredis';
import {IResult, UAParser} from 'ua-parser-js';

import {ConfigurationService} from '@core/config/config.service';
import {REDIS} from '@core/redis/redis.constants';
import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {SessionDto} from '../api/dtos/session.dto';
import {AuthenticatedSession} from './authenticated-session.interface';

@Injectable()
export class SessionService {
  private readonly REDIS_KEY: string;

  constructor(
    @Inject(REDIS) private readonly redisClient: Redis,
    private readonly configService: ConfigurationService,
    private readonly userService: UserService,
  ) {
    this.REDIS_KEY = this.configService.get('SESSION_REDIS_KEY');
  }

  /**
   * Gets metadata of all active sessions for a user.
   * Uses the Redis SCAN command to iterate through session keys in batches.
   *
   * NOTE: This implementation does not scale well.
   */
  async getSessions(userId: User['id'], currentSessionId: string) {
    const userSessions: SessionDto[] = [];

    const scanBatchSize = '250';
    let cursor = '0';
    const prefix = `${this.REDIS_KEY}:`;
    const matchPattern = `${prefix}*`;

    while (true) {
      const reply = await this.redisClient.scan(
        cursor,
        'MATCH',
        matchPattern,
        'COUNT',
        scanBatchSize,
      );

      cursor = reply[0];
      const keys = reply[1];

      if (keys.length > 0) {
        const sessionDataStrings = await this.redisClient.mget(keys);

        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const sessionDataString = sessionDataStrings[i];
          if (!sessionDataString) continue;

          const sessionData: AuthenticatedSession = JSON.parse(sessionDataString);

          if (sessionData?.passport?.user !== userId) continue;
          const sessionId = key.substring(prefix.length);

          userSessions.push({
            id: sessionId,
            ip: sessionData.metadata?.ip ?? 'Unknown',
            userAgent: sessionData.metadata?.userAgent ?? 'Unknown',
            clientDescription: sessionData.metadata?.clientDescription ?? 'Unknown device',
            clientLocation: sessionData.metadata?.clientLocation ?? 'Unknown',
            deviceType: sessionData.metadata?.deviceType ?? 'Unknown',
            createdAt: sessionData.metadata?.createdAt ?? new Date(0).toISOString(),
            lastSeenAt: sessionData.metadata?.lastSeenAt ?? new Date(0).toISOString(),
            isCurrent: sessionId === currentSessionId,
          });
        }
      }

      if (cursor === '0') break;
    }

    userSessions.sort((a, b) => {
      const isCurrentSortOrder = Number(b.isCurrent) - Number(a.isCurrent);
      if (isCurrentSortOrder !== 0) {
        return isCurrentSortOrder;
      }
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
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
    if (sessionIdToRevoke === currentSessionId) {
      throw new ConflictException('Cannot revoke the current session. Log out instead.');
    }

    await this.userService.verifyPassword(currentUser.password, password);

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
  async initializeSessionMetadata(request: Request) {
    if (!request.session) {
      return;
    }
    const session: AuthenticatedSession = request.session;
    if (!session.passport?.user || session.metadata) {
      return;
    }

    const ip = request.ip ?? 'Unknown';
    const userAgent = request.headers['user-agent'] ?? 'Unknown';
    const now = new Date().toISOString();

    const {clientDescription, deviceType} = this.getClientDescription(userAgent);
    const clientLocation = await this.getClientLocation(ip);

    session.metadata = {
      ip,
      userAgent,
      deviceType,
      clientDescription,
      createdAt: now,
      lastSeenAt: now,
      clientLocation,
    };
  }

  /** Updates the `lastSeenAt` timestamp in the session metadata */
  updateLastSeen(session: AuthenticatedSession) {
    if (!session.passport?.user || !session.metadata) {
      return;
    }
    session.metadata.lastSeenAt = new Date().toISOString();
  }

  /** Attempts to look up the geolocation for a given IP address. */
  async getClientLocation(ip: string) {
    //  • IPv4 loopback:       127.x.x.x
    //  • IPv6 loopback:       ::1
    //  • full IPv6 loopback:  0:0:0:0:0:0:0:1
    //  • IPv4‑mapped IPv6:    ::ffff:127.x.x.x
    const localhostRegex =
      /^(?:127(?:\.\d{1,3}){3}|::1|0:0:0:0:0:0:0:1|::ffff:127(?:\.\d{1,3}){3})$/;

    if (ip === 'Unknown' || localhostRegex.test(ip)) {
      return 'Unknown';
    }

    try {
      const geoData = await geoip.lookup(ip);
      if (!geoData) {
        return 'Unknown';
      }

      const parts = [geoData.city, geoData.region, geoData.country].filter(Boolean);

      if (parts.length === 0) return 'Unknown';
      if (geoData.city && geoData.country) return `${geoData.city}, ${geoData.country}`;
      if (geoData.region && geoData.country) return `${geoData.region}, ${geoData.country}`;

      return geoData.country ?? 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  /** Formats a session's user agent into a readable description and device type. */
  getClientDescription(userAgent: string) {
    if (userAgent === 'Unknown') {
      return {
        clientDescription: 'Unknown device',
        deviceType: 'Unknown',
      };
    }

    const parser = new UAParser(userAgent);
    const result: IResult = parser.getResult();

    const browserName = result.browser?.name;
    const osName = result.os?.name;
    const osVersion = result.os?.version;
    const deviceType = result.device?.type ?? 'desktop';

    let osPart = '';
    if (osName) {
      osPart = osVersion ? `${osName} ${osVersion}` : osName;
    }

    let clientDescription = 'Unknown device';
    if (browserName && osPart) {
      clientDescription = `${browserName} on ${osPart}`;
    } else if (browserName) {
      clientDescription = browserName;
    } else if (osPart) {
      clientDescription = osPart;
    } else {
      clientDescription = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
    }

    return {
      clientDescription,
      deviceType,
    };
  }
}
