import {Global, Module} from '@nestjs/common';
import Redis from 'ioredis';

import {ConfigurationService} from '@core/config/config.service';

import {REDIS} from './redis.constants';

@Global()
@Module({
	providers: [
		{
			provide: REDIS,
			inject: [ConfigurationService],
			useFactory: (config: ConfigurationService) => {
				const redisUrl = config.get('REDIS_URL');
				return new Redis(redisUrl, {maxRetriesPerRequest: null, enableReadyCheck: true});
			},
		},
	],
	exports: [REDIS],
})
export class RedisModule {}
