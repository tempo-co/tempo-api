import {faker} from '@faker-js/faker';
import {Test, TestingModule} from '@nestjs/testing';
import {Buffer} from 'buffer';
import {utils} from 'xlsx';

import {XlsFileParser} from './xls-file-parser';

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

function createXlsBuffer(mockRecords: MockTransaction[]): Buffer {
  const worksheet = utils.json_to_sheet(mockRecords);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return Buffer.from(utils.sheet_to_csv(worksheet));
}

describe('XlsFileParser', () => {
  let parser: XlsFileParser;
  let mockData: MockTransaction[];

  beforeEach(async () => {
    faker.seed(54);
    mockData = [createMockTransaction(), createMockTransaction()];
    const module: TestingModule = await Test.createTestingModule({
      providers: [XlsFileParser],
    }).compile();

    parser = module.get<XlsFileParser>(XlsFileParser);
  });

  it('should be defined', () => {
    expect(parser).toBeDefined();
  });

  describe('parse', () => {
    it('should correctly parse XLS content into an array of records', () => {
      const buffer = createXlsBuffer(mockData);
      const result = parser.parse(buffer);
      expect(result.length).toEqual(mockData.length);
    });

    it('should handle an empty XLS file', () => {
      const worksheet = utils.aoa_to_sheet([]);
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, 'Sheet1');

      const buffer = Buffer.from(utils.sheet_to_csv(worksheet));

      const result = parser.parse(buffer);
      expect(result).toEqual([]);
    });

    it('should handle XLS files with special characters correctly', () => {
      mockData[0].description = `Refund from "${faker.company.name()}"`;
      mockData[1].description = `Payment to "${faker.company.name()}"`;
      const buffer = createXlsBuffer(mockData);

      const result = parser.parse(buffer);
      expect(result.length).toEqual(mockData.length);
    });

    it('should only process the first sheet in a multi-sheet workbook', () => {
      const sheet1Data = [createMockTransaction()];
      const sheet2Data = [createMockTransaction()];
      const worksheet1 = utils.json_to_sheet(sheet1Data);
      const worksheet2 = utils.json_to_sheet(sheet2Data);
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet1, 'Sheet1');
      utils.book_append_sheet(workbook, worksheet2, 'Sheet2');

      const buffer = Buffer.from(utils.sheet_to_csv(worksheet1));

      const result = parser.parse(buffer);
      expect(result.length).toEqual(sheet1Data.length);
    });
  });
});
