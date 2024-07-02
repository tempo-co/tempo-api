import {Module} from '@nestjs/common';

import {RefreshTokenRepositoryModule} from '@entities/refresh-token/refresh-token.repository.module';

import {RefreshTokenService} from './refresh-token.service';

@Module({
  imports: [RefreshTokenRepositoryModule],
  providers: [RefreshTokenService],
  exports: [RefreshTokenService],
})
export class RefreshTokenModule {}
