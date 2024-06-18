import {Args, Mutation, Resolver} from '@nestjs/graphql';
import {TypeAccount} from './account.type';
import {AccountService} from '../services/account.service';
import {InputAccountCreate} from './account-create.input';
import {CurrentUser} from '../../../../../core/auth/decorators/current-user.decorator';
import {User} from '../../../../../entities/user/user.entity';

@Resolver(() => TypeAccount)
export class AccountResolver {
  constructor(private readonly accountService: AccountService) {}

  @Mutation(() => TypeAccount)
  accountCreate(
    @Args() {alias, bank}: InputAccountCreate,
    @CurrentUser() user: User,
  ): Promise<TypeAccount> {
    const account = this.accountService.create({alias, bank}, user.id);
    return account;
  }
}
