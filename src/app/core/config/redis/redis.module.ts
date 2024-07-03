import {Global, Module} from '@nestjs/common';
import {RedisClientType, createClient} from 'redis';

import {REDIS} from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: async () => {
        const client: RedisClientType = createClient({url: 'redis://localhost:6379'});
        await client.connect().catch((err) => {
          console.error("Couldn't connect to Redis.", err);
          throw err;
        });
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
