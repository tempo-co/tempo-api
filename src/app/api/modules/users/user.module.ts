import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {User} from '@entities/user/user.entity';

import {UserQueriesResolver} from './graphql/user.queries.resolver';
import {UserService} from './services/user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserService, UserQueriesResolver],
  exports: [UserService],
})
export class UserModule {}
