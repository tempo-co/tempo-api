import {Module} from '@nestjs/common';

import {AccountRepositoryModule} from '@entities/account/account.repository.module';

import {UserModule} from '../users/user.module';
import {AccountController} from './account.controller';
import {AccountService} from './account.service';

@Module({
  imports: [AccountRepositoryModule, UserModule],
  providers: [AccountService],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
