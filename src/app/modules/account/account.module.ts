import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {UserModule} from '../user/user.module';
import {Account} from './account.entity';
import {AccountController} from './api/account.controller';
import {AccountRepository} from './repository/account.repository';
import {AccountService} from './services/account.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account]), UserModule],
  providers: [AccountService, AccountRepository],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
