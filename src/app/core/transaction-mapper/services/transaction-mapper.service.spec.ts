import {faker} from '@faker-js/faker';
import {BadRequestException} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {validate} from 'class-validator';

import {Bank} from '../constants/bank.enum';
import {TransactionMapperFactory} from './transaction-mapper.factory';
import {TransactionMapperService} from './transaction-mapper.service';

jest.mock('class-validator', () => ({
  validate: jest.fn().mockResolvedValue([]), // Simulate successful validation
}));

describe('TransactionMapperService', () => {
  let service: TransactionMapperService;
  let factory: TransactionMapperFactory;

  const description = faker.finance.transactionDescription();

  beforeEach(async () => {
    faker.seed(10);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionMapperService,
        {
          provide: TransactionMapperFactory,
          useValue: {
            create: jest.fn().mockImplementation((_bank: Bank) => ({
              map: jest.fn().mockReturnValue({
                startedDate: faker.date.past(),
                completedDate: faker.date.past(),
                description: description,
                amount: parseFloat(faker.finance.amount()),
                currency: faker.finance.currencyCode(),
              }),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionMapperService>(TransactionMapperService);
    factory = module.get<TransactionMapperFactory>(TransactionMapperFactory);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('map', () => {
    it.each(Object.values(Bank))('should map transactions successfully for %s', async (bank) => {
      const transactions = await service.map([{someKey: 'someValue'}], bank);
      expect(transactions).toHaveLength(1);
      expect(transactions[0].description).toEqual(description);
      expect(validate).toHaveBeenCalled();
      expect(factory.create).toHaveBeenCalledWith(bank);
    });

    it('should throw BadRequestException on validation failure', async () => {
      (validate as jest.Mock).mockResolvedValueOnce([{someError: 'Error details'}]);
      await expect(service.map([{someKey: 'someValue'}], Bank.ABN_AMRO)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle empty data array without errors', async () => {
      const transactions = await service.map([], Bank.ABN_AMRO);
      expect(transactions).toHaveLength(0);
    });

    it('should handle multiple transactions', async () => {
      const mockData = [{someKey: 'value1'}, {someKey: 'value2'}];
      const transactions = await service.map(mockData, Bank.ABN_AMRO);
      expect(transactions).toHaveLength(mockData.length);
    });
  });
});
