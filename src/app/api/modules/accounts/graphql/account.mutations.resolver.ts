import {Args, Mutation, Resolver} from '@nestjs/graphql';

import {CurrentUser} from '@core/auth/decorators/current-user.decorator';
import {User} from '@entities/user/user.entity';

import {AccountService} from '../services/account.service';
import {ArgsAccountCreate} from './account-create.args';
import {TypeAccount} from './account.type';

@Resolver(() => TypeAccount)
export class AccountMutationsResolver {
  constructor(private readonly accountService: AccountService) {}

  @Mutation(() => TypeAccount)
  accountCreate(@Args() args: ArgsAccountCreate, @CurrentUser() user: User): Promise<TypeAccount> {
    return this.accountService.create({accountPartial: args, userId: user.id});
  }
}
