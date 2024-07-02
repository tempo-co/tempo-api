import {Module} from '@nestjs/common';

import {RefreshTokenRepositoryModule} from '@entities/refresh-token/refresh-token.repository.module';
import {UserModule} from '@modules/users/user.module';

import {RefreshTokenService} from './refresh-token.service';

@Module({
  imports: [RefreshTokenRepositoryModule, UserModule],
  providers: [RefreshTokenService],
  exports: [RefreshTokenService],
})
export class RefreshTokenModule {}
