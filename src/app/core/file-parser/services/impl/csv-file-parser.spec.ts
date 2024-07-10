import {faker} from '@faker-js/faker';
import {Test, TestingModule} from '@nestjs/testing';
import {Buffer} from 'buffer';

import {CsvFileParser} from './csv-file-parser';

type MockTransaction = {
  transactionDate: string;
  valueDate: string;
  startBalance: string;
  endBalance: string;
  description: string;
  amount: string;
  mutationCode: string;
};

function createMockTransaction(): MockTransaction {
  return {
    transactionDate: faker.date.recent().toISOString().split('T')[0],
    valueDate: faker.date.recent().toISOString().split('T')[0],
    startBalance: faker.finance.amount(),
    endBalance: faker.finance.amount(),
    description: faker.company.name(),
    amount: faker.finance.amount({min: -100, max: 0, dec: 2}),
    mutationCode: faker.finance.currencyCode(),
  };
}

function createCsvBuffer(mockRecords: MockTransaction[]): Buffer {
  const headers = Object.keys(mockRecords[0]).join(',');
  const rows = mockRecords.map((data) =>
    Object.values(data)
      .map((value) => `"${value}"`)
      .join(','),
  );
  const csvContent = [headers, ...rows].join('\n');
  return Buffer.from(csvContent);
}

describe('CsvFileParser', () => {
  let parser: CsvFileParser;
  let mockData: MockTransaction[];

  beforeEach(async () => {
    faker.seed(41);
    mockData = [createMockTransaction(), createMockTransaction()];
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsvFileParser],
    }).compile();

    parser = module.get<CsvFileParser>(CsvFileParser);
  });

  it('should be defined', () => {
    expect(parser).toBeDefined();
  });

  describe('parse', () => {
    it('should correctly parse CSV content into an array of records', () => {
      const buffer = createCsvBuffer(mockData);
      const result = parser.parse(buffer);

      expect(result).toEqual(mockData);
    });

    it('should handle an empty CSV file', () => {
      const buffer = Buffer.from('');
      const result = parser.parse(buffer);
      expect(result).toEqual([]);
    });

    it('should handle a CSV file with only headers', () => {
      const buffer = Buffer.from(
        'transactionDate,valueDate,startBalance,endBalance,description,amount,mutationCode',
      );
      const result = parser.parse(buffer);
      expect(result).toEqual([]);
    });

    it('should handle CSV files with special characters correctly', () => {
      const buffer = Buffer.from('description,amount\n"Name, Inc.",100\n"Another ""Quote""",200');
      const result = parser.parse(buffer);
      expect(result[0].description).toEqual('Name, Inc.');
      expect(result[1].description).toEqual('Another "Quote"');
    });

    it('should handle CSV files with white spaces in headers and data', () => {
      const buffer = Buffer.from(' transactionDate , valueDate \n 2023-04-01 , 2023-04-02 ');
      const result = parser.parse(buffer);
      expect(result[0]).toHaveProperty('transactionDate', '2023-04-01');
      expect(result[0]).toHaveProperty('valueDate', '2023-04-02');
    });

    it('should correctly convert mixed case headers to camelCase', () => {
      const buffer = Buffer.from('Transaction Date,Value Date\n2023-04-01,2023-04-02');
      const result = parser.parse(buffer);
      expect(result[0]).toHaveProperty('transactionDate');
      expect(result[0]).toHaveProperty('valueDate');
    });

    it('should throw an error for CSV files with incomplete rows', () => {
      const buffer = Buffer.from('transactionDate,valueDate\n2023-04-01');
      expect(() => parser.parse(buffer)).toThrow();
    });

    it('should throw an error for CSV files with extra columns in rows', () => {
      const buffer = Buffer.from('transactionDate,valueDate\n2023-04-01,2023-04-02,ExtraData');
      expect(() => parser.parse(buffer)).toThrow();
    });
  });
});
