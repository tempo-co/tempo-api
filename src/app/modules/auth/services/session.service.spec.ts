import {ConflictException, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {Request} from 'express';
import {Session} from 'express-session';
import * as geoip from 'fast-geoip';
import Redis from 'ioredis';
import {UAParser} from 'ua-parser-js';

import {ConfigurationService} from '@core/config/config.service';
import {REDIS} from '@core/redis/redis.constants';
import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {AuthenticatedSession} from './authenticated-session.interface';
import {SessionService} from './session.service';

jest.mock('fast-geoip');
const mockedGeoipLookup = geoip.lookup as jest.MockedFunction<typeof geoip.lookup>;

const mockGetResult = jest.fn();
jest.mock('ua-parser-js', () => {
  return {
    UAParser: jest.fn().mockImplementation(() => {
      return {getResult: mockGetResult};
    }),
  };
});

const mockRedisClient = {
  scan: jest.fn(),
  mget: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

const mockUserService = {
  verifyPassword: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  validateEmailIsUnique: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

type MockSession = Session & AuthenticatedSession;

describe('SessionService', () => {
  let service: SessionService;
  let redisClient: jest.Mocked<Redis>;
  let configService: jest.Mocked<ConfigurationService>;
  let userService: jest.Mocked<UserService>;

  const SESSION_KEY_PREFIX = 'test_sessions';
  const MOCK_USER_ID = 'user-123';
  const MOCK_CURRENT_SESSION_ID = 'session-abc';
  const MOCK_SESSION_ID = 'mock-session-id-xyz';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetResult.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: REDIS,
          useValue: mockRedisClient,
        },
        {
          provide: ConfigurationService,
          useValue: mockConfigService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    redisClient = module.get(REDIS);
    configService = module.get(ConfigurationService);
    userService = module.get(UserService);

    configService.get.mockReturnValue(SESSION_KEY_PREFIX);
    (service as any).REDIS_KEY = SESSION_KEY_PREFIX;

    mockedGeoipLookup.mockResolvedValue({
      country: 'NL',
      region: 'NH',
      city: 'Amsterdam',
      ll: [0, 0],
      range: [0, 0],
      timezone: 'Europe/Amsterdam',
      eu: '1',
      metro: 0,
      area: 0,
    });
    mockGetResult.mockReturnValue({
      ua: 'Test UA',
      browser: {name: 'Chrome', version: '100.0', major: '100'},
      os: {name: 'Windows', version: '10'},
      device: {type: 'desktop', model: undefined, vendor: undefined},
      engine: {name: 'Blink', version: '100.0'},
      cpu: {architecture: undefined},
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSessions', () => {
    it('should return an empty array if no sessions found in redis', async () => {
      redisClient.scan.mockResolvedValueOnce(['0', []]);

      const sessions = await service.getSessions(MOCK_USER_ID, MOCK_CURRENT_SESSION_ID);

      expect(sessions).toEqual([]);
      expect(redisClient.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        `${SESSION_KEY_PREFIX}:*`,
        'COUNT',
        '250',
      );
      expect(redisClient.mget).not.toHaveBeenCalled();
    });

    it('should return formatted sessions for the given user, sorting correctly', async () => {
      const otherUserId = 'other-user-456';
      const sessionKey1 = `${SESSION_KEY_PREFIX}:session-1`;
      const sessionKey2 = `${SESSION_KEY_PREFIX}:session-2`;
      const sessionKey3 = `${SESSION_KEY_PREFIX}:${MOCK_CURRENT_SESSION_ID}`;
      const sessionKey4 = `${SESSION_KEY_PREFIX}:session-4`;

      const mockSessionData1: Partial<AuthenticatedSession> & {id?: string} = {
        id: 'session-1',
        passport: {user: MOCK_USER_ID},
        metadata: {
          ip: '1.1.1.1',
          userAgent: 'UA1',
          deviceType: 'desktop',
          clientDescription: 'Chrome on Win',
          clientLocation: 'City, Country',
          createdAt: new Date('2023-01-01T10:00:00Z').toISOString(),
          lastSeenAt: new Date('2023-01-10T10:00:00Z').toISOString(),
        },
        cookie: {originalMaxAge: 360000} as any,
      };
      const mockSessionData2: Partial<AuthenticatedSession> & {id?: string} = {
        id: 'session-2',
        passport: {user: otherUserId},
        metadata: {
          ip: '2.2.2.2',
          userAgent: 'UA2',
          deviceType: 'mobile',
          clientDescription: 'Safari on iOS',
          clientLocation: 'City2, Country2',
          createdAt: new Date('2023-01-05T10:00:00Z').toISOString(),
          lastSeenAt: new Date('2023-01-15T10:00:00Z').toISOString(),
        },
        cookie: {originalMaxAge: 360000} as any,
      };
      const mockSessionData3: Partial<AuthenticatedSession> & {id?: string} = {
        id: MOCK_CURRENT_SESSION_ID,
        passport: {user: MOCK_USER_ID},
        metadata: {
          ip: '3.3.3.3',
          userAgent: 'UA3',
          deviceType: 'desktop',
          clientDescription: 'Firefox on Mac',
          clientLocation: 'City3, Country3',
          createdAt: new Date('2023-01-02T10:00:00Z').toISOString(),
          lastSeenAt: new Date('2023-01-25T10:00:00Z').toISOString(),
        },
        cookie: {originalMaxAge: 360000} as any,
      };
      const mockSessionData4: Partial<AuthenticatedSession> & {id?: string} = {
        id: 'session-4',
        passport: {user: MOCK_USER_ID},
        metadata: {
          ip: '4.4.4.4',
          userAgent: 'UA4',
          deviceType: 'tablet',
          clientDescription: 'Edge on Android',
          clientLocation: 'City4, Country4',
          createdAt: new Date('2023-01-03T10:00:00Z').toISOString(),
          lastSeenAt: new Date('2023-01-20T10:00:00Z').toISOString(),
        },
        cookie: {originalMaxAge: 360000} as any,
      };

      // Simulate SCAN returning keys in batches
      redisClient.scan
        .mockResolvedValueOnce(['1', [sessionKey1, sessionKey2]])
        .mockResolvedValueOnce(['0', [sessionKey3, sessionKey4]]);

      // Simulate MGET responses
      redisClient.mget
        .mockResolvedValueOnce([JSON.stringify(mockSessionData1), JSON.stringify(mockSessionData2)])
        .mockResolvedValueOnce([
          JSON.stringify(mockSessionData3),
          JSON.stringify(mockSessionData4),
        ]);

      const sessions = await service.getSessions(MOCK_USER_ID, MOCK_CURRENT_SESSION_ID);

      expect(redisClient.scan).toHaveBeenCalledTimes(2);
      expect(redisClient.mget).toHaveBeenCalledTimes(2);
      expect(redisClient.mget).toHaveBeenCalledWith([sessionKey1, sessionKey2]);
      expect(redisClient.mget).toHaveBeenCalledWith([sessionKey3, sessionKey4]);
      expect(sessions).toHaveLength(3);

      expect(sessions[0].id).toBe(MOCK_CURRENT_SESSION_ID);
      expect(sessions[0].isCurrent).toBe(true);
      expect(sessions[1].id).toBe('session-4');
      expect(sessions[1].isCurrent).toBe(false);
      expect(sessions[2].id).toBe('session-1');
      expect(sessions[2].isCurrent).toBe(false);
      expect(sessions[0]).toEqual(
        expect.objectContaining({
          id: MOCK_CURRENT_SESSION_ID,
          ip: mockSessionData3.metadata?.ip,
          userAgent: mockSessionData3.metadata?.userAgent,
          clientDescription: mockSessionData3.metadata?.clientDescription,
          clientLocation: mockSessionData3.metadata?.clientLocation,
          deviceType: mockSessionData3.metadata?.deviceType,
          createdAt: mockSessionData3.metadata?.createdAt,
          lastSeenAt: mockSessionData3.metadata?.lastSeenAt,
          isCurrent: true,
        }),
      );
    });

    it('should handle sessions with missing metadata gracefully', async () => {
      const sessionKey1 = `${SESSION_KEY_PREFIX}:session-1`;
      const mockSessionData1: Partial<AuthenticatedSession> & {id?: string} = {
        id: 'session-1',
        passport: {user: MOCK_USER_ID},
        cookie: {originalMaxAge: 360000} as any,
      };

      redisClient.scan.mockResolvedValueOnce(['0', [sessionKey1]]);
      redisClient.mget.mockResolvedValueOnce([JSON.stringify(mockSessionData1)]);

      const sessions = await service.getSessions(MOCK_USER_ID, MOCK_CURRENT_SESSION_ID);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual({
        id: 'session-1',
        ip: 'Unknown',
        userAgent: 'Unknown',
        clientDescription: 'Unknown device',
        clientLocation: 'Unknown',
        deviceType: 'Unknown',
        createdAt: new Date(0).toISOString(),
        lastSeenAt: new Date(0).toISOString(),
        isCurrent: false,
      });
    });

    it('should handle null responses from mget', async () => {
      const sessionKey1 = `${SESSION_KEY_PREFIX}:session-1`; // Valid
      const sessionKey2 = `${SESSION_KEY_PREFIX}:session-2`; // Will return null from mget
      const mockSessionData1: Partial<AuthenticatedSession> & {id?: string} = {
        id: 'session-1',
        passport: {user: MOCK_USER_ID},
        metadata: {
          ip: '1.1.1.1',
          userAgent: 'UA1',
          deviceType: 'desktop',
          clientDescription: 'Chrome on Win',
          clientLocation: 'City, Country',
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        cookie: {originalMaxAge: 360000} as any,
      };

      redisClient.scan.mockResolvedValueOnce(['0', [sessionKey1, sessionKey2]]);
      redisClient.mget.mockResolvedValueOnce([JSON.stringify(mockSessionData1), null]); // Simulate one key missing in Redis

      const sessions = await service.getSessions(MOCK_USER_ID, MOCK_CURRENT_SESSION_ID);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('session-1');
    });
  });

  describe('revokeSession', () => {
    const mockUser = {id: MOCK_USER_ID, password: 'hashedPassword'} as User;
    const correctPassword = 'password123';
    const wrongPassword = 'wrongPassword';
    const sessionIdToRevoke = 'session-to-revoke';
    const sessionKeyToRevoke = `${SESSION_KEY_PREFIX}:${sessionIdToRevoke}`;
    const mockSessionData: Partial<AuthenticatedSession> & {id?: string} = {
      id: sessionIdToRevoke,
      passport: {user: MOCK_USER_ID},
      metadata: {
        ip: '1.1.1.1',
        userAgent: 'UA1',
        deviceType: 'desktop',
        clientDescription: 'Chrome on Win',
        clientLocation: 'City, Country',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      cookie: {originalMaxAge: 360000} as any,
    };

    it('should successfully revoke a session', async () => {
      userService.verifyPassword.mockResolvedValueOnce(undefined); // Simulate successful verification
      redisClient.get.mockResolvedValueOnce(JSON.stringify(mockSessionData));
      redisClient.del.mockResolvedValueOnce(1); // Simulate successful deletion

      const result = await service.revokeSession(
        mockUser,
        correctPassword,
        MOCK_CURRENT_SESSION_ID,
        sessionIdToRevoke,
      );

      expect(userService.verifyPassword).toHaveBeenCalledWith(mockUser.password, correctPassword);
      expect(redisClient.get).toHaveBeenCalledWith(sessionKeyToRevoke);
      expect(redisClient.del).toHaveBeenCalledWith(sessionKeyToRevoke);
      expect(result).toEqual({message: 'Session revoked.'});
    });

    it('should throw ConflictException if attempting to revoke the current session', async () => {
      await expect(
        service.revokeSession(
          mockUser,
          correctPassword,
          MOCK_CURRENT_SESSION_ID,
          MOCK_CURRENT_SESSION_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(userService.verifyPassword).not.toHaveBeenCalled();
      expect(redisClient.get).not.toHaveBeenCalled();
      expect(redisClient.del).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if password verification fails', async () => {
      userService.verifyPassword.mockRejectedValueOnce(new UnauthorizedException());
      await expect(
        service.revokeSession(mockUser, wrongPassword, MOCK_CURRENT_SESSION_ID, sessionIdToRevoke),
      ).rejects.toThrow(UnauthorizedException);
      expect(userService.verifyPassword).toHaveBeenCalledWith(mockUser.password, wrongPassword);
      expect(redisClient.get).not.toHaveBeenCalled();
      expect(redisClient.del).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if session to revoke is not found in Redis', async () => {
      userService.verifyPassword.mockResolvedValueOnce(undefined);
      redisClient.get.mockResolvedValueOnce(null); // Simulate session not found
      await expect(
        service.revokeSession(
          mockUser,
          correctPassword,
          MOCK_CURRENT_SESSION_ID,
          sessionIdToRevoke,
        ),
      ).rejects.toThrow(new NotFoundException(`Session not found or expired.`));
      expect(userService.verifyPassword).toHaveBeenCalledWith(mockUser.password, correctPassword);
      expect(redisClient.get).toHaveBeenCalledWith(sessionKeyToRevoke);
      expect(redisClient.del).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if session belongs to a different user', async () => {
      const differentUserSessionData: Partial<AuthenticatedSession> & {id?: string} = {
        ...mockSessionData,
        passport: {user: 'different-user-id'},
      };
      userService.verifyPassword.mockResolvedValueOnce(undefined);
      redisClient.get.mockResolvedValueOnce(JSON.stringify(differentUserSessionData));
      await expect(
        service.revokeSession(
          mockUser,
          correctPassword,
          MOCK_CURRENT_SESSION_ID,
          sessionIdToRevoke,
        ),
      ).rejects.toThrow(new NotFoundException(`Session not found or expired.`));
      expect(userService.verifyPassword).toHaveBeenCalledWith(mockUser.password, correctPassword);
      expect(redisClient.get).toHaveBeenCalledWith(sessionKeyToRevoke);
      expect(redisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('initializeSessionMetadata', () => {
    let mockRequest: Partial<Request>;
    let mockSession: MockSession;

    beforeEach(() => {
      const tempMockSession: any = {
        id: MOCK_SESSION_ID,
        passport: {user: MOCK_USER_ID},
      };

      tempMockSession.regenerate = jest.fn((callback) => {
        callback(null);
        return tempMockSession as MockSession;
      });
      tempMockSession.destroy = jest.fn((callback) => {
        callback(null);
        return tempMockSession as MockSession;
      });
      tempMockSession.reload = jest.fn((callback) => {
        callback(null);
        return tempMockSession as MockSession;
      });
      tempMockSession.save = jest.fn((callback) => {
        if (callback) callback(null);
        return tempMockSession as MockSession;
      }); // Handle optional callback
      tempMockSession.touch = jest.fn(() => tempMockSession as MockSession); // touch returns the session
      tempMockSession.cookie = {
        originalMaxAge: 360000,
        expires: new Date(Date.now() + 360000),
        httpOnly: true,
        path: '/',
        serialize: jest.fn(() => `sessionId=${MOCK_SESSION_ID}`),
      } as Session['cookie'];

      mockSession = tempMockSession as MockSession;

      mockRequest = {
        ip: '192.168.1.100',
        headers: {'user-agent': 'Test User Agent'},
        session: mockSession,
      };
    });

    it('should initialize metadata if session exists, has user, and no existing metadata', async () => {
      const getClientDescSpy = jest.spyOn(service, 'getClientDescription');
      const getClientLocSpy = jest.spyOn(service, 'getClientLocation');

      await service.initializeSessionMetadata(mockRequest as Request);

      expect((mockRequest.session as MockSession)?.metadata).toBeDefined();
      expect((mockRequest.session as MockSession)?.metadata?.ip).toBe(mockRequest.ip);
      expect((mockRequest.session as MockSession)?.metadata?.userAgent).toBe(
        mockRequest.headers?.['user-agent'],
      );
      expect((mockRequest.session as MockSession)?.metadata?.createdAt).toBeDefined();
      expect((mockRequest.session as MockSession)?.metadata?.lastSeenAt).toBe(
        (mockRequest.session as MockSession)?.metadata?.createdAt,
      );
      expect((mockRequest.session as MockSession)?.metadata?.clientDescription).toBe(
        'Chrome on Windows 10',
      );
      expect((mockRequest.session as MockSession)?.metadata?.deviceType).toBe('desktop');
      expect((mockRequest.session as MockSession)?.metadata?.clientLocation).toBe('Amsterdam, NL');

      expect(getClientDescSpy).toHaveBeenCalledWith(mockRequest.headers!['user-agent']);
      expect(getClientLocSpy).toHaveBeenCalledWith(mockRequest.ip);
      expect(mockedGeoipLookup).toHaveBeenCalledWith(mockRequest.ip);
      expect(UAParser).toHaveBeenCalledWith(mockRequest.headers!['user-agent']);
      expect(mockGetResult).toHaveBeenCalled();

      getClientDescSpy.mockRestore();
      getClientLocSpy.mockRestore();
    });

    it('should use defaults if ip or user-agent are missing', async () => {
      const specificMockRequest: Partial<Request> & {session: MockSession} = {
        headers: {},
        session: mockSession,
      };

      const getClientDescSpy = jest.spyOn(service, 'getClientDescription');
      const getClientLocSpy = jest.spyOn(service, 'getClientLocation');

      await service.initializeSessionMetadata(specificMockRequest as Request);

      expect(specificMockRequest.session?.metadata?.ip).toBe('Unknown');
      expect(specificMockRequest.session?.metadata?.userAgent).toBe('Unknown');
      expect(specificMockRequest.session?.metadata?.clientDescription).toBe('Unknown device');
      expect(specificMockRequest.session?.metadata?.deviceType).toBe('Unknown');
      expect(specificMockRequest.session?.metadata?.clientLocation).toBe('Unknown');

      expect(getClientDescSpy).toHaveBeenCalledWith('Unknown');
      expect(getClientLocSpy).toHaveBeenCalledWith('Unknown');

      getClientDescSpy.mockRestore();
      getClientLocSpy.mockRestore();
    });

    it('should not initialize metadata if request.session is undefined', async () => {
      mockRequest.session = undefined;
      await service.initializeSessionMetadata(mockRequest as Request);
      expect(mockedGeoipLookup).not.toHaveBeenCalled();
      expect(UAParser).not.toHaveBeenCalled();
    });

    it('should not initialize metadata if session.passport.user is missing', async () => {
      delete (mockRequest.session as MockSession)!.passport?.user;
      await service.initializeSessionMetadata(mockRequest as Request);
      expect((mockRequest.session as MockSession)?.metadata).toBeUndefined();
      expect(mockedGeoipLookup).not.toHaveBeenCalled();
      expect(UAParser).not.toHaveBeenCalled();
    });

    it('should not initialize metadata if metadata already exists', async () => {
      (mockRequest.session as MockSession)!.metadata = {
        ip: 'old',
        userAgent: 'old',
        deviceType: 'old',
        clientDescription: 'old',
        clientLocation: 'old',
        createdAt: 'old',
        lastSeenAt: 'old',
      };
      const getClientDescSpy = jest.spyOn(service, 'getClientDescription');
      const getClientLocSpy = jest.spyOn(service, 'getClientLocation');

      await service.initializeSessionMetadata(mockRequest as Request);

      expect((mockRequest.session as MockSession)?.metadata?.ip).toBe('old');
      expect(getClientDescSpy).not.toHaveBeenCalled();
      expect(getClientLocSpy).not.toHaveBeenCalled();

      getClientDescSpy.mockRestore();
      getClientLocSpy.mockRestore();
    });
  });

  describe('updateLastSeen', () => {
    let mockSession: MockSession;

    beforeEach(() => {
      const tempMockSession: any = {
        id: MOCK_SESSION_ID,
        passport: {user: MOCK_USER_ID},
        metadata: {
          ip: '1.1.1.1',
          userAgent: 'UA1',
          deviceType: 'desktop',
          clientDescription: 'Chrome',
          clientLocation: 'Loc',
          createdAt: new Date('2023-01-01').toISOString(),
          lastSeenAt: new Date('2023-01-10').toISOString(),
        },
        cookie: {
          originalMaxAge: 360000,
          expires: new Date(Date.now() + 360000),
          httpOnly: true,
          path: '/',
          secure: false,
          sameSite: 'strict',
          domain: undefined,
          serialize: jest.fn((name: string, value: string) => `${name}=${value}`),
        } as Session['cookie'],
      };

      tempMockSession.regenerate = jest.fn((callback: (err: any) => void) => {
        callback(null);
        return tempMockSession as MockSession;
      });
      tempMockSession.destroy = jest.fn((callback: (err: any) => void) => {
        callback(null);
        return tempMockSession as MockSession;
      });
      tempMockSession.reload = jest.fn((callback: (err: any) => void) => {
        callback(null);
        return tempMockSession as MockSession;
      });
      tempMockSession.save = jest.fn((callback?: (err: any) => void) => {
        if (callback) {
          callback(null);
        }
        return tempMockSession as MockSession;
      });
      tempMockSession.touch = jest.fn(() => {
        return tempMockSession as MockSession;
      });

      mockSession = tempMockSession as MockSession;
    });

    it('should update the lastSeenAt timestamp', () => {
      const initialLastSeen = mockSession.metadata?.lastSeenAt;
      expect(initialLastSeen).toBeDefined();

      service.updateLastSeen(mockSession);

      expect(mockSession.metadata?.lastSeenAt).toBeDefined();
      expect(mockSession.metadata?.lastSeenAt).not.toBe(initialLastSeen);
    });

    it('should not update if passport.user is missing', () => {
      delete mockSession.passport?.user;
      const initialLastSeen = mockSession.metadata?.lastSeenAt;
      service.updateLastSeen(mockSession);
      expect(mockSession.metadata?.lastSeenAt).toBe(initialLastSeen);
    });

    it('should not update if metadata is missing', () => {
      delete mockSession.metadata;
      const initialPassport = mockSession.passport;
      service.updateLastSeen(mockSession);
      expect(mockSession.metadata).toBeUndefined();
      expect(mockSession.passport).toEqual(initialPassport);
    });
  });

  describe('getClientLocation', () => {
    it("should return 'Unknown' for 'Unknown' IP", async () => {
      expect(await service.getClientLocation('Unknown')).toBe('Unknown');
      expect(mockedGeoipLookup).not.toHaveBeenCalled();
    });

    const ips = ['127.0.0.1', '127.1.2.3', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1'];
    it.each(ips)("should return 'Unknown' for localhost IP %s", async (ip) => {
      expect(await service.getClientLocation(ip)).toBe('Unknown');
      expect(mockedGeoipLookup).not.toHaveBeenCalled();
    });

    it('should return "City, Country" if both available', async () => {
      mockedGeoipLookup.mockResolvedValueOnce({
        city: 'Amsterdam',
        country: 'NL',
        region: 'NH',
      } as any);
      expect(await service.getClientLocation('8.8.8.8')).toBe('Amsterdam, NL');
      expect(mockedGeoipLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    it('should return "Region, Country" if city missing but region available', async () => {
      mockedGeoipLookup.mockResolvedValueOnce({
        city: undefined,
        country: 'DE',
        region: 'Berlin',
      } as any);
      expect(await service.getClientLocation('8.8.8.8')).toBe('Berlin, DE');
    });

    it('should return "Country" if only country available', async () => {
      mockedGeoipLookup.mockResolvedValueOnce({
        city: undefined,
        country: 'FR',
        region: undefined,
      } as any);
      expect(await service.getClientLocation('8.8.8.8')).toBe('FR');
    });

    it('should return "Unknown" if geoip lookup returns null', async () => {
      mockedGeoipLookup.mockResolvedValueOnce(null);
      expect(await service.getClientLocation('8.8.8.8')).toBe('Unknown');
    });

    it('should return "Unknown" if geoip lookup returns data without city, region, or country', async () => {
      mockedGeoipLookup.mockResolvedValueOnce({
        city: undefined,
        country: undefined,
        region: undefined,
        ll: [0, 0],
      } as any);
      expect(await service.getClientLocation('8.8.8.8')).toBe('Unknown');
    });

    it('should return "Unknown" if geoip lookup throws an error', async () => {
      mockedGeoipLookup.mockRejectedValueOnce(new Error('Lookup failed'));
      expect(await service.getClientLocation('8.8.8.8')).toBe('Unknown');
    });
  });

  describe('getClientDescription', () => {
    it("should return defaults for 'Unknown' user agent", () => {
      const result = service.getClientDescription('Unknown');
      expect(result).toEqual({clientDescription: 'Unknown device', deviceType: 'Unknown'});
      expect(UAParser).not.toHaveBeenCalled();
    });

    it('should return "Browser on OS Version" format', () => {
      mockGetResult.mockReturnValueOnce({
        browser: {name: 'Firefox', version: '90.1'},
        os: {name: 'MacOS', version: '11.5'},
        device: {type: 'desktop'},
      } as any);
      const result = service.getClientDescription('Some UA String');
      expect(result).toEqual({clientDescription: 'Firefox on MacOS 11.5', deviceType: 'desktop'});
      expect(UAParser).toHaveBeenCalledWith('Some UA String');
      expect(mockGetResult).toHaveBeenCalled();
    });

    it('should return "Browser on OS" format if OS version missing', () => {
      mockGetResult.mockReturnValueOnce({
        browser: {name: 'Edge'},
        os: {name: 'Android'},
        device: {type: 'mobile'},
      } as any);
      const result = service.getClientDescription('Some UA String');
      expect(result).toEqual({clientDescription: 'Edge on Android', deviceType: 'mobile'});
    });

    it('should return "Browser" format if OS missing', () => {
      mockGetResult.mockReturnValueOnce({
        browser: {name: 'Safari'},
        os: {},
        device: {type: 'tablet'},
      } as any);
      const result = service.getClientDescription('Some UA String');
      expect(result).toEqual({clientDescription: 'Safari', deviceType: 'tablet'});
    });

    it('should return "OS Version" format if browser missing', () => {
      mockGetResult.mockReturnValueOnce({
        browser: {},
        os: {name: 'iOS', version: '14.0'},
        device: {type: 'mobile'},
      } as any);
      const result = service.getClientDescription('Some UA String');
      expect(result).toEqual({clientDescription: 'iOS 14.0', deviceType: 'mobile'});
    });

    it('should return capitalized device type if browser and OS missing', () => {
      mockGetResult.mockReturnValueOnce({browser: {}, os: {}, device: {type: 'smarttv'}} as any);
      const result = service.getClientDescription('Some UA String');
      expect(result).toEqual({clientDescription: 'Smarttv', deviceType: 'smarttv'});
    });

    it('should default device type to "desktop" if parser provides none', () => {
      mockGetResult.mockReturnValueOnce({
        browser: {name: 'Opera'},
        os: {name: 'Linux'},
        device: {},
      } as any);
      const result = service.getClientDescription('Some UA String');
      expect(result).toEqual({clientDescription: 'Opera on Linux', deviceType: 'desktop'});
    });
  });
});
