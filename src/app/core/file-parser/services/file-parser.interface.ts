export interface FileParser {
  parse(buffer: Buffer): Record<string, string>[];
}
