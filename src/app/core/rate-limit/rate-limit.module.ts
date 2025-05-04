import {ThrottlerStorageRedisService} from '@nest-lab/throttler-storage-redis';
import {Module} from '@nestjs/common';
import {ThrottlerModule} from '@nestjs/throttler';
import Redis from 'ioredis';
import ms from 'ms';

import {ConfigurationService} from '@core/config/config.service';
import {REDIS} from '@core/redis/redis.constants';
import {RedisModule} from '@core/redis/redis.module';

@Module({
	imports: [
		ThrottlerModule.forRootAsync({
			imports: [RedisModule],
			inject: [ConfigurationService, REDIS],
			useFactory: (config: ConfigurationService, redisClient: Redis) => {
				if (config.get('NODE_ENV') === 'test') return [];
				return {
					throttlers: [
						{
							ttl: ms(config.get('THROTTLE_TTL')),
							limit: config.get('THROTTLE_LIMIT'),
						},
					],
					storage: new ThrottlerStorageRedisService(redisClient),
				};
			},
		}),
	],
})
export class RateLimitModule {}
