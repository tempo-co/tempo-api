import {Inject, MiddlewareConsumer, Module, NestModule} from '@nestjs/common';
import RedisStore from 'connect-redis';
import session from 'express-session';
import Redis from 'ioredis';
import ms from 'ms';
import passport from 'passport';

import {ConfigurationService} from '@core/config/config.service';
import {REDIS} from '@core/redis/redis.constants';
import {RedisModule} from '@core/redis/redis.module';
import {SessionMiddleware} from '@core/session/session.middleware';
import {AuthModule} from '@modules/auth/auth.module';

@Module({imports: [RedisModule, AuthModule]})
export class SessionModule implements NestModule {
	constructor(
		@Inject(REDIS) private readonly redisClient: Redis,
		private readonly config: ConfigurationService,
	) {}

	async configure(consumer: MiddlewareConsumer) {
		const isProduction = this.config.get('NODE_ENV') === 'production';

		consumer
			.apply(
				session({
					store: new RedisStore({client: this.redisClient}),
					name: 'session',
					secret: this.config.get('SESSION_SECRET'),
					resave: false,
					saveUninitialized: false,
					cookie: {
						secure: isProduction,
						httpOnly: true,
						sameSite: 'strict',
						maxAge: ms(this.config.get('SESSION_EXPIRATION')),
						...(isProduction ? {domain: this.config.get('WEB_BASE_URL')} : {}),
					},
				}),
				passport.initialize(),
				passport.session(),
				SessionMiddleware,
			)
			.forRoutes('*');
	}
}
