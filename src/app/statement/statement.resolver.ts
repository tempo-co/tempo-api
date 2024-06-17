import { Resolver, Args, Mutation } from '@nestjs/graphql';
import { Statement } from './models/statement.model';
import { Transaction } from '../transaction/models/transaction.model';
import { StatementService } from './statement.service';
import { UploadStatementArgs } from './dto/upload-statement.args';

@Resolver(() => Statement)
export class StatementResolver {
  constructor(private readonly statementService: StatementService) {}

  @Mutation(() => [Transaction])
  async uploadStatement(
    @Args() args: UploadStatementArgs,
  ): Promise<Transaction[]> {
    const transactions = await this.statementService.processStatement(args);
    return transactions;
  }
}
