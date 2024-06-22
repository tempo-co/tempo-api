import {Module} from '@nestjs/common';

import {AccountRepositoryModule} from '@entities/account/account.repository.module';

import {UserModule} from '../users/user.module';
import {AccountMutationsResolver} from './graphql/account.mutations.resolver';
import {AccountService} from './services/account.service';

@Module({
  imports: [AccountRepositoryModule, UserModule],
  providers: [AccountService, AccountMutationsResolver],
  exports: [AccountService],
})
export class AccountModule {}
