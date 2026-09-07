import {Module} from '@nestjs/common';

import {RedisModule} from '@core/redis/redis.module';

import {SessionService} from './session.service';

/**
 * Leaf module around SessionService: it only needs Redis, so feature modules
 * can consume it without importing the whole AuthModule (which would create a
 * cycle with AccountModule, whose deletion flow revokes sessions).
 */
@Module({
	imports: [RedisModule],
	providers: [SessionService],
	exports: [SessionService],
})
export class SessionsModule {}
