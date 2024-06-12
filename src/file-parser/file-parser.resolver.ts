import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { FileParserFactory } from './file-parser.factory';
import { Bank } from 'src/bank-transaction-adapter/constant/bank';
import { Transaction } from 'src/transaction/model/transaction.model';
import { BankTransactionAdapterFactory } from 'src/bank-transaction-adapter/bank-transaction-adapter.factory';

@Resolver()
export class FileParserResolver {
  constructor(
    private readonly fileParserFactory: FileParserFactory,
    private readonly bankTransactionAdapterFactory: BankTransactionAdapterFactory,
  ) {}

  @Mutation(() => [Transaction])
  async parse(
    @Args({ name: 'file', type: () => GraphQLUpload })
    file: FileUpload,
    @Args('bank') bank: Bank,
  ) {
    const { createReadStream, mimetype } = file;
    const stream = createReadStream();
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const data = this.fileParserFactory.create(mimetype).parse(buffer);
    const transactions = this.bankTransactionAdapterFactory
      .create(bank)
      .map(data);

    return transactions;
  }
}
