import { Injectable } from '@nestjs/common';
import { FileParserFactory } from './file-parser.factory';
import { FileUpload } from 'graphql-upload';
import { BankTransactionAdapterFactory } from 'src/app/bank-transaction-adapter/bank-transaction-adapter.factory';
import { Bank } from 'src/app/bank-transaction-adapter/constants/bank';
import { ReadStream } from 'fs-capacitor';
import { Transaction } from '../transaction/entities/transaction.entity';

@Injectable()
export class FileParserService {
  constructor(
    private readonly fileParserFactory: FileParserFactory,
    private readonly bankTransactionAdapterFactory: BankTransactionAdapterFactory,
  ) {}

  async parse(file: FileUpload, bank: Bank): Promise<Transaction[]> {
    const { createReadStream, mimetype } = file;
    const stream = createReadStream();

    const buffer = await this.readStream(stream);

    const fileParser = this.fileParserFactory.create(mimetype);
    const data = fileParser.parse(buffer);

    const adapter = this.bankTransactionAdapterFactory.create(bank);
    const transactions = adapter.map(data);

    return transactions;
  }

  private async readStream(stream: ReadStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
