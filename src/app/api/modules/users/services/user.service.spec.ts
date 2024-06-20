import {faker} from '@faker-js/faker';
import {ConflictException, NotFoundException} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {randomUUID} from 'crypto';
import {DeleteResult, Repository} from 'typeorm';

import {User} from '@entities/user/user.entity';

import {CreateUserArgs} from '../dto/create-user.args';
import {UserService} from './user.service';

describe('UserService', () => {
  let userService: UserService;
  let userRepository: Repository<User>;

  beforeEach(async () => {
    faker.seed(123);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            delete: jest.fn().mockResolvedValue(new DeleteResult()),
            save: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    userService = module.get<UserService>(UserService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(userService).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const result: User[] = [];

      jest.spyOn(userRepository, 'find').mockResolvedValue(result);
      expect(await userService.findAll()).toBe(result);
    });
  });

  describe('findById', () => {
    it('should return a user by id', async () => {
      const id = randomUUID();
      const user: User = {
        id: id,
        name: faker.person.fullName(),
        email: faker.internet.email(),
        isActive: true,
        createdDate: new Date(),
        password: faker.internet.password(),
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);
      expect(await userService.findById(id)).toEqual(user);
      expect(userRepository.findOne).toHaveBeenCalledWith({where: {id}});
    });

    it('should throw NotFoundException if user not found by id', async () => {
      const nonExistingId = randomUUID();

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      await expect(userService.findById(nonExistingId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should return a user by email', async () => {
      const email = faker.internet.email();
      const user: User = {
        id: randomUUID(),
        name: faker.person.fullName(),
        email: email,
        isActive: true,
        createdDate: new Date(),
        password: faker.internet.password(),
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);
      expect(await userService.findByEmail(email)).toBe(user);
    });

    it('should throw NotFoundException if user not found by email', async () => {
      const email = faker.internet.email();

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      await expect(userService.findByEmail(email)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a user', async () => {
      const id = randomUUID();

      jest.spyOn(userRepository, 'delete').mockResolvedValue(new DeleteResult());
      await userService.remove(id);
      expect(userRepository.delete).toHaveBeenCalledWith(id);
    });

    it('should not throw an error when deleting a non-existing user', async () => {
      const nonExistingId = randomUUID();

      jest.spyOn(userRepository, 'delete').mockResolvedValue(new DeleteResult());
      await expect(userService.remove(nonExistingId)).resolves.not.toThrow();
    });
  });

  describe('create', () => {
    it('should create a user', async () => {
      const createUserArgs: CreateUserArgs = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password(),
      };

      const createdUser: User = {
        id: randomUUID(),
        ...createUserArgs,
        isActive: true,
        createdDate: new Date(),
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'save').mockResolvedValue(createdUser);
      expect(await userService.create(createUserArgs)).toEqual(createdUser);
    });

    it('should throw ConflictException when attempting to create a user with an email that already exists', async () => {
      const user: User = {
        id: randomUUID(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        isActive: true,
        createdDate: new Date(),
        password: faker.internet.password(),
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);
      await expect(userService.create(user)).rejects.toThrow(ConflictException);
    });
  });
});
