import {Resolver, Args, Mutation} from '@nestjs/graphql';
import {TypeBankStatement} from './bank-statement.type';
import {Transaction} from 'src/app/entities/transaction/transaction.entity';
import {StatementService} from '../services/statement.service';
import {FileUpload} from 'graphql-upload';
import {Account} from 'src/app/entities/account/account.entity';

@Resolver(() => TypeBankStatement)
export class StatementResolver {
  constructor(private readonly statementService: StatementService) {}

  @Mutation(() => [Transaction])
  async uploadStatement(
    @Args('file') file: FileUpload,
    @Args('accountId') accountId: Account['id'],
  ): Promise<Transaction[]> {
    const transactions = await this.statementService.processStatement({file, accountId});
    return transactions;
  }
}
