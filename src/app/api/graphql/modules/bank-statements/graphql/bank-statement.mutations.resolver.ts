import {FileUpload, GraphQLUpload} from 'graphql-upload';
import {Resolver, Args, Mutation} from '@nestjs/graphql';
import {Account} from '@entities/account/account.entity';
import {TypeTransaction} from '@modules/transactions/graphql/transaction.type';
import {TypeBankStatement} from './bank-statement.type';
import {BankStatementService} from '../services/bank-statement.service';

@Resolver(() => TypeBankStatement)
export class BankStatementResolver {
  constructor(private readonly bankStatementService: BankStatementService) {}

  @Mutation(() => [TypeTransaction])
  async uploadBankStatement(
    @Args('file', {type: () => GraphQLUpload}) file: FileUpload,
    @Args('accountId', {type: () => String}) accountId: Account['id'],
  ): Promise<TypeTransaction[]> {
    const transactions = await this.bankStatementService.processBankStatement({file, accountId});
    return transactions;
  }
}
