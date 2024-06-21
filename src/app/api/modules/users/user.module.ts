import {Module} from '@nestjs/common';

import {UserRepositoryModule} from '@entities/user/user.repository.module';

import {UserQueriesResolver} from './graphql/user.queries.resolver';
import {UserService} from './services/user.service';

@Module({
  imports: [UserRepositoryModule],
  providers: [UserService, UserQueriesResolver],
  exports: [UserService],
})
export class UserModule {}
