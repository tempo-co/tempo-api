import {randomUUID} from 'crypto';
import {Test, TestingModule} from '@nestjs/testing';
import {ConflictException} from '@nestjs/common';
import {faker} from '@faker-js/faker';
import {User} from '@entities/user/user.entity';
import {CreateUserArgs} from '@modules/users/dto/create-user.args';
import {AuthService} from './auth.service';
import {AuthResolver} from './auth.resolver';
import {AccessToken} from './dto/access-token.output';
import {LoginArgs} from './dto/login.args';

describe('AuthResolver', () => {
  let resolver: AuthResolver;
  let authService: AuthService;

  beforeEach(async () => {
    faker.seed(545);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthResolver,
        {
          provide: AuthService,
          useValue: {
            signAccessToken: jest.fn(),
            createUser: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get<AuthResolver>(AuthResolver);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('logIn', () => {
    it('should return an access token', async () => {
      const loginArgs: LoginArgs = {
        email: faker.internet.email(),
        password: faker.internet.password(),
      };
      const user: User = {
        id: randomUUID(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        isActive: true,
        createdDate: new Date(),
        password: faker.internet.password(),
      };

      const accessToken: AccessToken = {
        access_token: 'access_token',
      };
      jest.spyOn(authService, 'signAccessToken').mockResolvedValue(accessToken);

      expect(await resolver.logIn(loginArgs, user)).toBe(accessToken);
    });
  });

  describe('signUp', () => {
    it('should create a user and return an access token', async () => {
      const createUserArgs: CreateUserArgs = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password(),
      };

      const user: User = {
        id: randomUUID(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        isActive: true,
        createdDate: new Date(),
        password: faker.internet.password(),
      };

      const accessToken: AccessToken = {
        access_token: 'access_token',
      };
      jest.spyOn(authService, 'createUser').mockResolvedValue(user);
      jest.spyOn(authService, 'signAccessToken').mockResolvedValue(accessToken);

      expect(await resolver.signUp(createUserArgs)).toBe(accessToken);
    });

    it('should throw ConflictException if email already exists', async () => {
      const createUserArgs: CreateUserArgs = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password(),
      };

      jest.spyOn(authService, 'createUser').mockImplementation(() => {
        throw new ConflictException();
      });

      await expect(resolver.signUp(createUserArgs)).rejects.toThrow(ConflictException);
    });
  });
});
