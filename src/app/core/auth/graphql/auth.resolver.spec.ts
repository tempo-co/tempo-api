import {faker} from '@faker-js/faker';
import {ConflictException} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {randomUUID} from 'crypto';

import {User} from '@entities/user/user.entity';

import {AuthService} from '../services/auth.service';
import {TypeAccessToken} from './access-token.type';
import {AuthMutationsResolver} from './auth.mutations.resolver';
import {ArgsLogIn} from './login.args';
import {ArgsSignUp} from './signup.args';

describe('AuthResolver', () => {
  let resolver: AuthMutationsResolver;
  let authService: AuthService;

  beforeEach(async () => {
    faker.seed(545);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthMutationsResolver,
        {
          provide: AuthService,
          useValue: {
            signAccessToken: jest.fn(),
            createUser: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get<AuthMutationsResolver>(AuthMutationsResolver);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('logIn', () => {
    it('should return an access token', async () => {
      const loginArgs: ArgsLogIn = {
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

      const accessToken: TypeAccessToken = {
        access_token: 'access_token',
      };
      jest.spyOn(authService, 'signAccessToken').mockResolvedValue(accessToken);

      expect(await resolver.logIn(loginArgs, user)).toBe(accessToken);
    });
  });

  describe('signUp', () => {
    it('should create a user and return an access token', async () => {
      const createUserArgs: ArgsSignUp = {
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

      const accessToken: TypeAccessToken = {
        access_token: 'access_token',
      };
      jest.spyOn(authService, 'createUser').mockResolvedValue(user);
      jest.spyOn(authService, 'signAccessToken').mockResolvedValue(accessToken);

      expect(await resolver.signUp(createUserArgs)).toBe(accessToken);
    });

    it('should throw ConflictException if email already exists', async () => {
      const createUserArgs: ArgsSignUp = {
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
