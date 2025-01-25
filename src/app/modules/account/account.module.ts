import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {UserModule} from '../user/user.module';
import {Account} from './account.entity';
import {AccountService} from './account.service';
import {AccountController} from './api/account.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Account]), UserModule],
  providers: [AccountService],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
