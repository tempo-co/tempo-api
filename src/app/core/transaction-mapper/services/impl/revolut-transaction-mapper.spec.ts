import {faker} from '@faker-js/faker';
import {Test, TestingModule} from '@nestjs/testing';

import {RevolutTransaction, RevolutTransactionMapper} from './revolut-transaction-mapper';

function createRevolutTransaction(): RevolutTransaction {
  return {
    type: 'CARD_PAYMENT',
    product: 'Current',
    startedDate: '2023-01-01T00:00:00Z',
    completedDate: '2023-01-02T00:00:00Z',
    description: faker.finance.transactionDescription(),
    amount: faker.finance.amount(),
    fee: '0.00',
    currency: 'EUR',
    state: 'COMPLETED',
    balance: faker.finance.amount(),
  };
}

describe('RevolutTransactionMapper', () => {
  let mapper: RevolutTransactionMapper;

  beforeEach(async () => {
    faker.seed(21);
    const module: TestingModule = await Test.createTestingModule({
      providers: [RevolutTransactionMapper],
    }).compile();

    mapper = module.get<RevolutTransactionMapper>(RevolutTransactionMapper);
  });

  it('should be defined', () => {
    expect(mapper).toBeDefined();
  });

  describe('map', () => {
    it('should correctly map a RevolutTransaction to a TransactionPartial', () => {
      const input = createRevolutTransaction();
      const expectedOutput = {
        startedDate: new Date(input.startedDate),
        completedDate: new Date(input.completedDate),
        description: input.description,
        amount: parseFloat(input.amount),
        currency: input.currency,
      };

      const result = mapper.map(input);

      expect(result).toEqual(expectedOutput);
    });

    it('should trim and replace multiple spaces in description', () => {
      const expectedDescription = 'Test transaction with spaces';
      const input = {...createRevolutTransaction(), description: expectedDescription};

      const result = mapper.map(input);

      expect(result.description).toEqual(expectedDescription);
    });

    it('should correctly parse and map the amount to a float', () => {
      const input = {...createRevolutTransaction(), amount: '50.00'};
      const expectedAmount = 50.0;

      const result = mapper.map(input);

      expect(result.amount).toBe(expectedAmount);
    });
  });
});
