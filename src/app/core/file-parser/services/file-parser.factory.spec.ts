import {BadRequestException} from '@nestjs/common';
import {Test} from '@nestjs/testing';

import {MimeType} from '../constants/mime-type.enum';
import {FileParserFactory} from './file-parser.factory';
import {CsvFileParser} from './impl/csv-file-parser';
import {XlsFileParser} from './impl/xls-file-parser';

describe('FileParserFactory', () => {
  let factory: FileParserFactory;

  // Dynamically map mimetypes to their corresponding parser classes
  const parserMappings = [
    {mimetype: MimeType.XLS, parser: XlsFileParser},
    {mimetype: MimeType.CSV, parser: CsvFileParser},
  ];

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FileParserFactory,
        // Automatically provide all parser implementations
        ...parserMappings.map((mapping) => ({provide: mapping.parser, useClass: mapping.parser})),
      ],
    }).compile();

    factory = moduleRef.get<FileParserFactory>(FileParserFactory);
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  describe('create', () => {
    // Dynamically generate tests for each parser based on the mappings
    parserMappings.forEach(({mimetype, parser}) => {
      it(`should return an instance of ${parser.name} for ${mimetype} mimetype`, async () => {
        const parserInstance = factory.create(mimetype);
        expect(parserInstance).toBeInstanceOf(parser);
      });
    });

    it('should throw BadRequestException for unsupported mimetypes', () => {
      expect(() => factory.create('application/pdf')).toThrow(BadRequestException);
    });
  });
});
