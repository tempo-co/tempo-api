import {faker} from '@faker-js/faker';
import {NotFoundException} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {randomUUID} from 'crypto';

import {User} from '@entities/user/user.entity';

import {UserService} from '../services/user.service';
import {UserQueriesResolver} from './user.queries.resolver';

describe('UserResolver', () => {
  let userResolver: UserQueriesResolver;
  let userService: UserService;

  beforeEach(async () => {
    faker.seed(123);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserQueriesResolver,
        {
          provide: UserService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findById: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    userResolver = module.get<UserQueriesResolver>(UserQueriesResolver);
    userService = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(userResolver).toBeDefined();
  });

  describe('users', () => {
    it('should return all users', async () => {
      const result: User[] = [];
      jest.spyOn(userService, 'findAll').mockResolvedValue(result);
      expect(await userResolver.users()).toBe(result);
    });
  });

  describe('user', () => {
    it('should return a user by id', async () => {
      const id = randomUUID();
      //FIXME: Was this failing before?
      const result: User = {
        id: id,
        name: faker.person.fullName(),
        email: faker.internet.email(),
        isActive: true,
        createdDate: new Date(),
        password: faker.internet.password(),
      };

      jest.spyOn(userService, 'findById').mockResolvedValue(result);
      expect(await userResolver.user(id)).toBe(result);
    });

    it('should throw NotFoundException if user not found by id', async () => {
      const nonExistingId = randomUUID();

      jest.spyOn(userService, 'findById').mockImplementation(() => {
        throw new NotFoundException();
      });
      await expect(userResolver.user(nonExistingId)).rejects.toThrow(NotFoundException);
    });
  });
});
