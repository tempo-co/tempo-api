import {Args, Mutation, Resolver} from '@nestjs/graphql';
import {User} from '@entities/user/user.entity';
import {CurrentUser} from '@core/auth/decorators/current-user.decorator';
import {AccountService} from '../services/account.service';
import {TypeAccount} from './account.type';
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
