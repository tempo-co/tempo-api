import {validationSchema} from '@config/env/validation-schema';
import {REDIS} from '@config/redis/redis.constants';
import {RedisModule} from '@config/redis/redis.module';
import {
  ClassSerializerInterceptor,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ThrottlerGuard, ThrottlerModule, minutes} from '@nestjs/throttler';
import {TypeOrmModule} from '@nestjs/typeorm';
import RedisStore from 'connect-redis';
import session from 'express-session';
import ms from 'ms';
import {GracefulShutdownModule} from 'nestjs-graceful-shutdown';
import passport from 'passport';
import {RedisClientType} from 'redis';

import {AuthModule} from '@core/auth/auth.module';
import {FileParserModule} from '@core/file-parser/file-parser.module';
import {TransactionCategorizerModule} from '@core/transaction-categorizer/transaction-categorizer.module';
import {BankStatementModule} from '@modules/bank-statement/bank-statement.module';
import {TransactionModule} from '@modules/transaction/transaction.module';
import {UserModule} from '@modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema,
      envFilePath: ['.env.development.local', '.env.development'],
      cache: true,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        synchronize: config.get<boolean>('DB_SYNCHRONIZE'),
        autoLoadEntities: true,
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: minutes(1),
        limit: 400,
      },
    ]),
    GracefulShutdownModule.forRoot(),
    RedisModule,
    FileParserModule,
    TransactionModule,
    AuthModule,
    UserModule,
    BankStatementModule,
    TransactionCategorizerModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  constructor(
    @Inject(REDIS) private readonly redisClient: RedisClientType,
    private readonly config: ConfigService,
  ) {}
  async configure(consumer: MiddlewareConsumer) {
    const redisStore = new RedisStore({client: this.redisClient});
    const isProduction = this.config.get('NODE_ENV') === 'production';
    const secret = this.config.get('SESSION_SECRET');
    const expiration = this.config.get('SESSION_EXPIRATION');
    const expirationMs = ms(expiration as string);
    consumer
      .apply(
        session({
          store: redisStore,
          name: 'session',
          secret: secret,
          resave: false,
          saveUninitialized: false,
          cookie: {
            secure: isProduction,
            httpOnly: true,
            sameSite: 'strict',
            domain: 'localhost',
            maxAge: expirationMs,
          },
        }),
        passport.initialize(),
        passport.session(),
      )
      .forRoutes('*');
  }
}
