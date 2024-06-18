import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {User} from '../../../../entities/user/user.entity';
import {UserService} from './services/user.service';
import {UserQueriesResolver} from './graphql/user.queries.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserService, UserQueriesResolver],
  exports: [UserService],
})
export class UserModule {}
