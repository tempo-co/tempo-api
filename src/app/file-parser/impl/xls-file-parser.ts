import { read, utils } from 'xlsx';
import { FileParser } from '../file-parser.interface';

export class XlsFileParser implements FileParser {
  parse(fileBuffer: Buffer): unknown[] {
    const workbook = read(fileBuffer, { type: 'buffer' });

    const worksheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[worksheetName];

    const data = utils.sheet_to_json(worksheet, { raw: false });
    return data;
  }
}
