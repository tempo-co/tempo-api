import {Resolver, Args, Mutation} from '@nestjs/graphql';
import {TypeBankStatement} from './bank-statement.type';
import {Transaction} from 'src/app/entities/transaction/transaction.entity';
import {BankStatementService} from '../services/statement.service';
import {FileUpload, GraphQLUpload} from 'graphql-upload';
import {Account} from 'src/app/entities/account/account.entity';

@Resolver(() => TypeBankStatement)
export class BankStatementResolver {
  constructor(private readonly bankStatementService: BankStatementService) {}

  @Mutation(() => [Transaction])
  async uploadBankStatement(
    @Args('file', {type: () => GraphQLUpload}) file: FileUpload,
    @Args('accountId', {type: () => String}) accountId: Account['id'],
  ): Promise<Transaction[]> {
    const transactions = await this.bankStatementService.processBankStatement({file, accountId});
    return transactions;
  }
}
