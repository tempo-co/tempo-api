import {read, utils} from 'xlsx';

import {FileParser} from '../file-parser.interface';

export class XlsFileParser implements FileParser {
	parse(buffer: Buffer): Record<string, string>[] {
		const workbook = read(buffer, {type: 'buffer'});

		const worksheetName = workbook.SheetNames[0];
		const worksheet = workbook.Sheets[worksheetName];

		return utils.sheet_to_json(worksheet, {raw: false});
	}
}
