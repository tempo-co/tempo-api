import {BadRequestException} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';

import {Bank} from '../constants/bank.enum';
import {AbnAmroTransactionMapper} from './impl/abnamro-transaction-mapper';
import {RevolutTransactionMapper} from './impl/revolut-transaction-mapper';
import {TransactionMapperFactory} from './transaction-mapper.factory';

describe('TransactionMapperFactory', () => {
  let factory: TransactionMapperFactory;
  let abnAmroMapper: AbnAmroTransactionMapper;
  let revolutMapper: RevolutTransactionMapper;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionMapperFactory,
        {provide: AbnAmroTransactionMapper, useValue: {}},
        {provide: RevolutTransactionMapper, useValue: {}},
      ],
    }).compile();

    factory = module.get<TransactionMapperFactory>(TransactionMapperFactory);
    abnAmroMapper = module.get<AbnAmroTransactionMapper>(AbnAmroTransactionMapper);
    revolutMapper = module.get<RevolutTransactionMapper>(RevolutTransactionMapper);
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  describe('create', () => {
    it('should return an instance of AbnAmroTransactionMapper for ABN_AMRO bank', () => {
      expect(factory.create(Bank.ABN_AMRO)).toBe(abnAmroMapper);
    });

    it('should return an instance of RevolutTransactionMapper for REVOLUT bank', () => {
      expect(factory.create(Bank.REVOLUT)).toBe(revolutMapper);
    });

    it('should throw BadRequestException for unsupported banks', () => {
      expect(() => factory.create('UNSUPPORTED_BANK' as Bank)).toThrow(BadRequestException);
    });
  });
});
