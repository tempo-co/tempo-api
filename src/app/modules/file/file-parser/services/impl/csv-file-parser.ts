import {Options, parse as csvToJson} from 'csv-parse/sync';

import {FileParser} from '../file-parser.interface';

export class CsvFileParser implements FileParser {
	parse(buffer: Buffer): Record<string, string>[] {
		const options: Options = {
			columns: (header) => header.map((columnName: string) => this.toCamelCase(columnName)),
			skip_empty_lines: true,
			trim: true,
		};

		return csvToJson(buffer.toString(), options);
	}

	private toCamelCase(columnName: string): string {
		return columnName
			.trim()
			.replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
			.replace(/^./, (match) => match.toLowerCase());
	}
}
