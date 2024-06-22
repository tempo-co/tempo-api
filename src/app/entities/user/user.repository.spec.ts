import {faker} from '@faker-js/faker';
import {Test, TestingModule} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {DeepPartial, Repository} from 'typeorm';

import {User} from './user.entity';
import {UserRepository, UserSaveOptions} from './user.repository';

describe('UserRepository', () => {
  let userRepository: UserRepository;
  let mockRepository: Partial<Repository<User>>;

  beforeEach(async () => {
    faker.seed(1);
    mockRepository = {
      create: jest.fn().mockImplementation((user: DeepPartial<User>) => ({
        ...user,
      })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    userRepository = module.get<UserRepository>(UserRepository);
  });

  describe('findAll', () => {
    it('should find all users', async () => {
      const users = await userRepository.findAll();
      expect(mockRepository.find).toHaveBeenCalled();
      expect(users).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should find a user by id', async () => {
      const id = faker.string.uuid();
      const user = {id};
      (mockRepository.findOne as jest.Mock).mockResolvedValue(user);

      const foundUser = await userRepository.findById(id);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {id},
        relations: ['accounts', 'accounts.transactions'],
      });
      expect(foundUser).toEqual(user);
    });

    it('should return null if user is not found by id', async () => {
      const id = faker.string.uuid();
      (mockRepository.findOne as jest.Mock).mockResolvedValue(null);

      const foundUser = await userRepository.findById(id);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {id},
        relations: ['accounts', 'accounts.transactions'],
      });
      expect(foundUser).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const email = faker.internet.email();
      const user = {
        id: faker.string.uuid(),
        email,
      };
      (mockRepository.findOne as jest.Mock).mockResolvedValue(user);

      const foundUser = await userRepository.findByEmail(email);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {email},
        relations: ['accounts', 'accounts.transactions'],
      });
      expect(foundUser).toEqual(user);
    });

    it('should return null if user is not found by email', async () => {
      const email = faker.internet.email();
      (mockRepository.findOne as jest.Mock).mockResolvedValue(null);

      const foundUser = await userRepository.findByEmail(email);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {email},
        relations: ['accounts', 'accounts.transactions'],
      });
      expect(foundUser).toBeNull();
    });
  });

  describe('save', () => {
    it('should save a user', async () => {
      const user: UserSaveOptions = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password(),
      };
      const savedUser = {...user, id: faker.string.uuid(), createdAt: new Date()};
      (mockRepository.save as jest.Mock).mockResolvedValue(savedUser);

      const result = await userRepository.save(user);
      expect(mockRepository.save).toHaveBeenCalledWith(user);
      expect(result).toEqual(savedUser);
    });
  });
});
