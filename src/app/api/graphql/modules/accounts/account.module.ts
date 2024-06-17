import {Module} from '@nestjs/common';
import {Account} from '../../../../entities/account/account.entity';
import {TypeOrmModule} from '@nestjs/typeorm';
import {AccountService} from './services/account.service';
import {AccountResolver} from './graphql/account.mutations.resolver';
import {UserModule} from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Account]), UserModule],
  providers: [AccountService, AccountResolver],
  exports: [AccountService],
})
export class AccountModule {}
