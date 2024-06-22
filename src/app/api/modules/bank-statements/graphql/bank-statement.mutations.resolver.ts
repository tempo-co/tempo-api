import {Args, Mutation, Resolver} from '@nestjs/graphql';

import {BankStatementService} from '../services/bank-statement.service';
import {ArgsBankStatementUpload} from './bank-statement-upload.args';
import {TypeBankStatement} from './bank-statement.type';

@Resolver(() => TypeBankStatement)
export class BankStatementMutationsResolver {
  constructor(private readonly bankStatementService: BankStatementService) {}

  @Mutation(() => TypeBankStatement)
  async bankStatementUpload(@Args() args: ArgsBankStatementUpload): Promise<TypeBankStatement> {
    const {file, accountId} = args;
    return this.bankStatementService.process(await file, accountId);
  }
}
