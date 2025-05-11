import {BullModule} from '@nestjs/bullmq';
import {Global, Module} from '@nestjs/common';
import Redis from 'ioredis';

import {REDIS} from '@core/redis/redis.constants';
import {RedisModule} from '@core/redis/redis.module';

@Global()
@Module({
	imports: [
		RedisModule,
		BullModule.forRootAsync({
			imports: [RedisModule],
			inject: [REDIS],
			useFactory: async (redisClient: Redis) => {
				return {
					connection: redisClient,
					defaultJobOptions: {
						attempts: 3,
						backoff: {type: 'exponential', delay: 1000},
						removeOnComplete: true,
						removeOnFail: {age: 86400, count: 500},
					},
				};
			},
		}),
	],
	exports: [BullModule],
})
export class QueueModule {}
