import {Global, Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {createClient} from 'redis';

import {REDIS} from './redis.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        const client = createClient({url: redisUrl});
        return await client.connect();
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
