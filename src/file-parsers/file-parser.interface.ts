export interface FileParser {
  parse(fileBuffer: Buffer): unknown[];
}
