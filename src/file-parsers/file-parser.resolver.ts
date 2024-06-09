import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { FileParserFactory } from './file-parser.factory';
import { CreateTransactionDto } from 'src/transaction/dto/create-transaction.dto';

@Resolver()
export class FileParserResolver {
  constructor(private readonly fileParserFactory: FileParserFactory) {}

  @Mutation(() => [CreateTransactionDto])
  async parse(
    @Args({ name: 'file', type: () => GraphQLUpload })
    { createReadStream, mimetype }: FileUpload,
  ) {
    const stream = createReadStream();
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const parser = this.fileParserFactory.create(mimetype);
    const transactions = parser.parse(buffer);
    return transactions;
  }
}
