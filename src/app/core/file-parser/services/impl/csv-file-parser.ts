import {parse} from 'csv-parse/sync';

import {FileParser} from '../file-parser.interface';

export class CsvFileParser implements FileParser {
  parse(buffer: Buffer): Record<string, string>[] {
    const fileContent = buffer.toString();
    const records = parse(fileContent, {
      columns: (header) => header.map((columnName: string) => this.toCamelCase(columnName)),
      skip_empty_lines: true,
      trim: true,
    });
    return records;
  }

  private toCamelCase(columnName: string): string {
    return columnName
      .trim()
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, (match) => match.toLowerCase());
  }
}
