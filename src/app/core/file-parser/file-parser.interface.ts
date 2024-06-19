export interface FileParser {
  parse(fileBuffer: Buffer): Record<string, string>[];
}
