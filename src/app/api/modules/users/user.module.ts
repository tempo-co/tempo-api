import {Module} from '@nestjs/common';

import {UserRepositoryModule} from '@entities/user/user.repository.module';

import {UserController} from './user.controller';
import {UserService} from './user.service';

@Module({
  imports: [UserRepositoryModule],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
