import {Args, Mutation, Resolver} from '@nestjs/graphql';
import {TypeAccount} from './account.type';
import {AccountService} from '../services/account.service';
import {CurrentUser} from '../../../../../core/auth/decorators/current-user.decorator';
import {User} from '../../../../../entities/user/user.entity';
import {InputAccountCreate} from './account-create.input';

@Resolver(() => TypeAccount)
export class AccountResolver {
  constructor(private readonly accountService: AccountService) {}

  @Mutation(() => TypeAccount)
  accountCreate(
    @Args('inputAccountCreate') inputAccountCreate: InputAccountCreate,
    @CurrentUser() user: User,
  ): Promise<TypeAccount> {
    return this.accountService.create(inputAccountCreate, user.id);
  }
}
