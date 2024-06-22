import {faker} from '@faker-js/faker';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Account} from './account.entity';
import {AccountRepository} from './account.repository';

describe('AccountRepository', () => {
  let accountRepository: AccountRepository;
  let mockRepository: Partial<Repository<Account>>;

  beforeEach(async () => {
    faker.seed(4);
    mockRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue({}),
    };

    const module = await Test.createTestingModule({
      providers: [
        AccountRepository,
        {
          provide: getRepositoryToken(Account),
          useValue: mockRepository,
        },
      ],
    }).compile();

    accountRepository = module.get<AccountRepository>(AccountRepository);
  });

  it('should be defined', () => {
    expect(accountRepository).toBeDefined();
  });

  describe('save', () => {
    it('should save an account', async () => {
      const account: Account = {id: faker.string.uuid()} as Account;
      (mockRepository.save as jest.Mock).mockResolvedValue(account);

      expect(await accountRepository.save(account)).toEqual(account);
      expect(mockRepository.save).toHaveBeenCalledWith(account);
    });
  });

  describe('findAllByUserId', () => {
    it('should find all accounts by user id', async () => {
      const userId = faker.string.uuid();
      const accounts: Account[] = [
        {id: faker.string.uuid()} as Account,
        {id: faker.string.uuid()} as Account,
      ];
      (mockRepository.find as jest.Mock).mockResolvedValue(accounts);

      expect(await accountRepository.findAllByUserId(userId)).toEqual(accounts);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {user: {id: userId}},
      });
    });
  });

  describe('findById', () => {
    it('should find an account by id', async () => {
      const id = faker.string.uuid();
      const account = {id} as Account;
      (mockRepository.findOne as jest.Mock).mockResolvedValue(account);

      expect(await accountRepository.findById(id)).toEqual(account);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {id},
      });
    });
  });
});
