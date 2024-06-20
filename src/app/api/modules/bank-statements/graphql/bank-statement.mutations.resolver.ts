import {Resolver, Args, Mutation} from '@nestjs/graphql';
import {TypeTransaction} from '@modules/transactions/graphql/transaction.type';
import {BankStatementService} from '../services/bank-statement.service';
import {TypeBankStatement} from './bank-statement.type';
import {ArgsBankStatementUpload} from './bank-statement-upload.args';

@Resolver(() => TypeBankStatement)
export class BankStatementMutationsResolver {
  constructor(private readonly bankStatementService: BankStatementService) {}

  @Mutation(() => [TypeTransaction])
  async bankStatementUpload(@Args() args: ArgsBankStatementUpload): Promise<TypeBankStatement> {
    const {file, accountId} = args;
    return await this.bankStatementService.process(file, accountId);
  }
}
