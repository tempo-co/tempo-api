import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Account} from '@entities/account/account.entity';
import {UserModule} from '../users/users.module';
import {AccountResolver} from './graphql/account.mutations.resolver';
import {AccountService} from './services/account.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account]), UserModule],
  providers: [AccountService, AccountResolver],
  exports: [AccountService],
})
export class AccountModule {}
