import {faker} from '@faker-js/faker';
import {NotFoundException} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {DeepPartial, Repository} from 'typeorm';

import {Transaction} from '@entities/transaction/transaction.entity';

import {InputTransactionCreate} from '../graphql/transaction-create.input';
import {TransactionService} from './transaction.service';

const createTransactionDto = (): InputTransactionCreate => {
  return {
    startedDate: faker.date.past(),
    completedDate: faker.date.recent(),
    description: faker.lorem.sentence(),
    amount: parseFloat(faker.finance.amount()),
    currency: faker.finance.currencyCode(),
  };
};

const createTransactionEntity = (): Transaction => {
  // FIXME: Was this throwing errors before?
  return {...createTransactionDto(), id: faker.string.uuid()};
};

describe('TransactionService', () => {
  let transactionService: TransactionService;
  let transactionRepository: Repository<Transaction>;

  beforeEach(async () => {
    faker.seed(889);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useClass: Repository,
        },
      ],
    }).compile();

    transactionService = module.get<TransactionService>(TransactionService);
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
  });

  it('should be defined', () => {
    expect(transactionService).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of transactions', async () => {
      const transaction = createTransactionEntity();
      jest.spyOn(transactionRepository, 'find').mockResolvedValueOnce([transaction]);

      const transactions = await transactionService.findAll();
      expect(transactions).toEqual([transaction]);
    });

    it('should return an empty array when there are no transactions', async () => {
      jest.spyOn(transactionRepository, 'find').mockResolvedValueOnce([]);

      const transactions = await transactionService.findAll();
      expect(transactions).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return a single transaction by id', async () => {
      const id = faker.string.uuid();
      const expectedTransaction = createTransactionEntity();
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValueOnce(expectedTransaction);

      const transaction = await transactionService.findById(id);
      expect(transaction).toEqual(expectedTransaction);
    });

    it('should throw NotFoundException if transaction not found by id', async () => {
      const id = faker.string.uuid();
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValueOnce(null);

      await expect(transactionService.findById(id)).rejects.toThrow(NotFoundException);
    });
  });

  describe.skip('create', () => {
    it('should successfully create a transaction', async () => {
      const expectedTransaction = createTransactionEntity();
      jest.spyOn(transactionRepository, 'save').mockResolvedValueOnce(expectedTransaction);

      // Account missing
      const transaction = await transactionService.saveAll([expectedTransaction]);
      expect(transaction).toEqual(expectedTransaction);
    });

    it('should successfully create multiple transactions', async () => {
      const expectedTransactions: InputTransactionCreate[] = Array.from(
        {length: 3},
        createTransactionDto,
      );

      jest
        .spyOn(transactionRepository, 'save')
        .mockImplementation((transaction: DeepPartial<Transaction>) =>
          Promise.resolve(transaction as Transaction),
        );

      const transactions = await transactionService.saveAll(expectedTransactions);

      expect(transactions).toEqual(expectedTransactions);
    });
  });
});
