import {faker} from '@faker-js/faker';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Account} from './account.entity';
import {AccountRepository} from './account.repository';

describe('AccountRepository', () => {
  let accountRepository: AccountRepository;
  let repository: Repository<Account>;

  beforeEach(async () => {
    faker.seed(4);
    const module = await Test.createTestingModule({
      providers: [
        AccountRepository,
        {
          provide: getRepositoryToken(Account),
          useClass: Repository,
        },
      ],
    }).compile();

    accountRepository = module.get<AccountRepository>(AccountRepository);
    repository = module.get<Repository<Account>>(getRepositoryToken(Account));
  });

  describe('save', () => {
    it('should save an account', async () => {
      const account: Account = {id: faker.string.uuid()} as Account;
      jest.spyOn(repository, 'save').mockResolvedValue(account);

      expect(await accountRepository.save(account)).toEqual(account);
      expect(repository.save).toHaveBeenCalledWith(account);
    });
  });

  describe('findAllByUserId', () => {
    it('should find all accounts by user id', async () => {
      const userId = faker.string.uuid();
      const accounts: Account[] = [
        {id: faker.string.uuid()} as Account,
        {id: faker.string.uuid()} as Account,
      ];
      jest.spyOn(repository, 'find').mockResolvedValue(accounts);

      expect(await accountRepository.findAllByUserId(userId)).toEqual(accounts);
      expect(repository.find).toHaveBeenCalledWith({
        where: {user: {id: userId}},
      });
    });
  });

  describe('findById', () => {
    it('should find an account by id', async () => {
      const id = faker.string.uuid();
      const account = {id} as Account;
      jest.spyOn(repository, 'findOne').mockResolvedValue(account);

      expect(await accountRepository.findById(id)).toEqual(account);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {id},
      });
    });
  });
});
