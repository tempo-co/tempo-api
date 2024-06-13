import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { Bank } from 'src/bank-transaction-adapter/constant/bank';
import { Transaction } from 'src/transaction/model/transaction.model';
import { FileParserService } from './file-parser.service';

@Resolver()
export class FileParserResolver {
  constructor(private readonly fileParserService: FileParserService) {}

  @Mutation(() => [Transaction])
  async parse(
    @Args({ name: 'file', type: () => GraphQLUpload })
    file: FileUpload,
    @Args('bank') bank: Bank,
  ) {
    const transactions = await this.fileParserService.parse(file, bank);

    return transactions;
  }
}
