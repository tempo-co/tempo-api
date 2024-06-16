import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { faker } from '@faker-js/faker';
import { randomUUID } from 'crypto';
import { CreateUserArgs } from '../user/dto/create-user.args';

describe('AuthService', () => {
  let authService: AuthService;
  let userService: UserService;
  let jwtService: JwtService;

  beforeEach(async () => {
    faker.seed(545);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return a user if the email exists and password is valid', async () => {
      const password = faker.internet.password();
      const email = faker.internet.email();
      const user: User = {
        id: randomUUID(),
        name: faker.person.fullName(),
        email: email,
        isActive: true,
        createdDate: new Date(),
        password: password,
      };

      user.password = await argon2.hash(password);
      userService.findByEmail = jest.fn().mockResolvedValue(user);

      expect(await authService.validateUser(email, password)).toBe(user);
    });

    it('should return null if the password is invalid', async () => {
      const password = faker.internet.password();
      const email = faker.internet.email();
      const user: User = {
        id: randomUUID(),
        name: faker.person.fullName(),
        email: email,
        isActive: true,
        createdDate: new Date(),
        password: password,
      };
      user.password = await argon2.hash(password);
      userService.findByEmail = jest.fn().mockResolvedValue(user);

      expect(
        await authService.validateUser(email, 'wrong-password'),
      ).toBeNull();
    });
  });

  describe('createUser', () => {
    it('should create a user', async () => {
      const name = faker.person.fullName();
      const email = faker.internet.email();
      const password = faker.internet.password();

      const user: User = {
        id: randomUUID(),
        name: name,
        email: email,
        isActive: true,
        createdDate: new Date(),
        password: password,
      };
      const createUserArgs: CreateUserArgs = {
        name: name,
        email: email,
        password: password,
      };
      userService.create = jest.fn().mockResolvedValue(user);

      expect(await authService.createUser(createUserArgs)).toBe(user);
    });
  });

  describe('signAccessToken', () => {
    it('should sign a JWT for a user', async () => {
      const user: User = {
        id: randomUUID(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        isActive: true,
        createdDate: new Date(),
        password: faker.internet.password(),
      };

      jwtService.signAsync = jest.fn().mockResolvedValue('access_token');
      expect(await authService.signAccessToken(user)).toEqual({
        access_token: 'access_token',
      });
    });
  });
});
