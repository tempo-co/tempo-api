import {faker} from '@faker-js/faker';
import {Test, TestingModule} from '@nestjs/testing';

import {AbnAmroTransaction, AbnAmroTransactionMapper} from './abnamro-transaction-mapper';

function createAbnAmroTransaction(): AbnAmroTransaction {
  return {
    transactiondate: '20230101',
    valuedate: '20230102',
    startsaldo: faker.finance.amount(),
    endsaldo: faker.finance.amount(),
    description: faker.finance.transactionDescription(),
    amount: faker.finance.amount(),
    mutationcode: 'EUR',
  };
}

describe('AbnAmroTransactionMapper', () => {
  let mapper: AbnAmroTransactionMapper;

  beforeEach(async () => {
    faker.seed(20);
    const module: TestingModule = await Test.createTestingModule({
      providers: [AbnAmroTransactionMapper],
    }).compile();

    mapper = module.get<AbnAmroTransactionMapper>(AbnAmroTransactionMapper);
  });

  it('should be defined', () => {
    expect(mapper).toBeDefined();
  });

  describe('map', () => {
    it('should correctly map an AbnAmroTransaction to a TransactionPartial', () => {
      const input = createAbnAmroTransaction();
      const expectedOutput = {
        startedDate: new Date(2023, 0, 1),
        completedDate: new Date(2023, 0, 2),
        description: input.description,
        amount: parseFloat(input.amount),
        currency: input.mutationcode,
      };

      const result = mapper.map(input);

      expect(result).toEqual(expectedOutput);
    });

    it('should trim and replace multiple spaces in description', () => {
      const expectedDescription = 'Test transaction with spaces';
      const input = {...createAbnAmroTransaction(), description: expectedDescription};

      const result = mapper.map(input);

      expect(result.description).toEqual(expectedDescription);
    });

    it('should correctly parse and map the amount to a float', () => {
      const input = {...createAbnAmroTransaction(), amount: '50.00'};
      const expectedAmount = 50.0;

      const result = mapper.map(input);

      expect(result.amount).toBe(expectedAmount);
    });
  });
});
