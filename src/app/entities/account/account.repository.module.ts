import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {Account} from './account.entity';
import {AccountRepository} from './account.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Account])],
  providers: [AccountRepository],
  exports: [AccountRepository],
})
export class AccountRepositoryModule {}
