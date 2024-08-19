import {faker} from '@faker-js/faker';
import {Test, TestingModule} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {BankStatement} from '../bank-statement.entity';
import {BankStatementRepository, BankStatementSaveOptions} from './bank-statement.repository';

describe('BankStatementRepository', () => {
  let bankStatementRepository: BankStatementRepository;
  let mockRepository: Partial<Repository<BankStatement>>;

  beforeEach(async () => {
    faker.seed(3);
    mockRepository = {
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankStatementRepository,
        {
          provide: getRepositoryToken(BankStatement),
          useValue: mockRepository,
        },
      ],
    }).compile();

    bankStatementRepository = module.get<BankStatementRepository>(BankStatementRepository);
  });

  it('should be defined', () => {
    expect(bankStatementRepository).toBeDefined();
  });

  describe('save', () => {
    it('should save a bank statement', async () => {
      const bankStatement: BankStatementSaveOptions = {
        file: Buffer.from(faker.lorem.words()),
        account: {id: faker.string.uuid()} as Account,
      };
      const expectedBankStatement: BankStatement = {
        ...bankStatement,
        id: faker.string.uuid(),
        transactions: [],
      };
      (mockRepository.save as jest.Mock).mockResolvedValue(expectedBankStatement);

      const result = await bankStatementRepository.save(bankStatement);
      expect(mockRepository.save).toHaveBeenCalledWith(bankStatement);
      expect(result).toEqual(expectedBankStatement);
    });
  });
});
