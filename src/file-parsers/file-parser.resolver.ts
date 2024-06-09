import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { FileParserFactory } from './file-parser.factory';
import { CreateTransactionDto } from 'src/transaction/dto/create-transaction.dto';

@Resolver()
export class FileParserResolver {
  @Mutation(() => [CreateTransactionDto])
  async parse(
    @Args({ name: 'file', type: () => GraphQLUpload })
    { createReadStream, mimetype }: FileUpload,
  ) {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const bufs: Buffer[] = [];
      const stream = createReadStream();
      stream.on('data', (chunk: Buffer) => bufs.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(bufs)));
      stream.on('error', reject);
    });

    const parser = FileParserFactory.createParser(mimetype);
    const result = parser.parse(buffer);
    return result;
  }
}
