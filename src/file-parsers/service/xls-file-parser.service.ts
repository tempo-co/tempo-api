import { FileParser } from 'src/file-parsers/file-parser.interface';
import { read, utils } from 'xlsx';

export class XlsFileParser implements FileParser {
  parse(fileBuffer: Buffer): unknown[] {
    const workbook = read(fileBuffer, { type: 'buffer' });

    const worksheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[worksheetName];

    const data = utils.sheet_to_json(worksheet, { raw: false });
    return data;
  }
}
