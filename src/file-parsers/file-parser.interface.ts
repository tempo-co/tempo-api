import { CreateTransactionDto } from 'src/transaction/dto/create-transaction.dto';

export interface FileParser {
  parse(fileBuffer: Buffer): Promise<CreateTransactionDto[]>;
}
