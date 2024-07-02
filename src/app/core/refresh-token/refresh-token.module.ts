import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';

import {RefreshTokenRepositoryModule} from '@entities/refresh-token/refresh-token.repository.module';
import {UserModule} from '@modules/users/user.module';

import {RefreshTokenService} from './refresh-token.service';

@Module({
  imports: [RefreshTokenRepositoryModule, UserModule, ConfigModule],
  providers: [RefreshTokenService],
  exports: [RefreshTokenService],
})
export class RefreshTokenModule {}
