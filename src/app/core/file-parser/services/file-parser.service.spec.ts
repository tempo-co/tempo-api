import {BadRequestException} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';

import {MimeType} from '../constants/mime-type.enum';
import {FileParserFactory} from './file-parser.factory';
import {FileParser} from './file-parser.interface';
import {FileParserService} from './file-parser.service';

describe('FileParserService', () => {
  let service: FileParserService;
  let factory: FileParserFactory;

  const mockParsers: Record<MimeType, jest.Mocked<FileParser>> = {
    [MimeType.CSV]: {parse: jest.fn()},
    [MimeType.XLS]: {parse: jest.fn()},
    [MimeType.XLSX]: {parse: jest.fn()},
  };

  const mockFactory = {
    create: jest.fn((mimetype: MimeType): FileParser => {
      const parser = mockParsers[mimetype];
      if (!parser) throw new BadRequestException(`Unsupported file type: ${mimetype}`);
      return parser;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileParserService, {provide: FileParserFactory, useValue: mockFactory}],
    }).compile();

    service = module.get<FileParserService>(FileParserService);
    factory = module.get<FileParserFactory>(FileParserFactory);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const testCases = [
    {
      mimetype: MimeType.CSV,
      buffer: Buffer.from('transactionDate,valueDate\n2023-04-01,2023-04-02'),
      result: [{transactionDate: '2023-04-01', valueDate: '2023-04-02'}],
    },
    {
      mimetype: MimeType.XLS,
      buffer: Buffer.from('some xls content'),
      result: [{transactionDate: '2023-04-01', valueDate: '2023-04-02'}],
    },
  ];

  testCases.forEach(({mimetype, buffer, result}) => {
    it(`should parse ${mimetype} files correctly`, () => {
      mockParsers[mimetype].parse.mockReturnValue(result);

      const parsedResult = service.parse(buffer, mimetype);
      expect(factory.create).toHaveBeenCalledWith(mimetype);
      expect(mockParsers[mimetype].parse).toHaveBeenCalledWith(buffer);
      expect(parsedResult).toEqual(result);
    });
  });

  it('should throw BadRequestException for unsupported mimetypes', () => {
    const unsupportedBuffer = Buffer.from('unsupported content');

    expect(() => service.parse(unsupportedBuffer, 'application/pdf')).toThrow(BadRequestException);
    expect(factory.create).toHaveBeenCalledWith('application/pdf');
  });
});
