import {validationSchema} from '@config/env/validation-schema';
import {REDIS} from '@config/redis/redis.constants';
import {RedisModule} from '@config/redis/redis.module';
import {ThrottlerStorageRedisService} from '@nest-lab/throttler-storage-redis';
import {MailerModule} from '@nestjs-modules/mailer';
import {HandlebarsAdapter} from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import {
  ClassSerializerInterceptor,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ThrottlerGuard, ThrottlerModule} from '@nestjs/throttler';
import {TypeOrmModule} from '@nestjs/typeorm';
import RedisStore from 'connect-redis';
import session from 'express-session';
import Redis from 'ioredis';
import ms from 'ms';
import passport from 'passport';
import {join} from 'path';

import {AuthModule} from '@core/auth/auth.module';
import {SessionMiddleware} from '@core/auth/services/session.middleware';
import {FileParserModule} from '@core/file-parser/file-parser.module';
import {TransactionCategorizerModule} from '@core/transaction-categorizer/transaction-categorizer.module';
import {BankStatementModule} from '@modules/bank-statement/bank-statement.module';
import {TransactionModule} from '@modules/transaction/transaction.module';
import {UserModule} from '@modules/user/user.module';

const envFilePaths = ['.env'];

if (process.env.NODE_ENV === 'test') {
  envFilePaths.unshift('.env.test.local', '.env.test');
} else {
  envFilePaths.unshift('.env.development.local', '.env.development');
}

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema,
      envFilePath: envFilePaths,
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
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('EMAIL_HOST'),
          port: config.get<number>('EMAIL_PORT'),
        },
        defaults: {from: '"Flair" <no-reply@flair.com>'},
        preview: config.get<string>('NODE_ENV') === 'development',
        template: {
          dir: join(__dirname, 'app', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {strict: true},
        },
      }),
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, REDIS],
      useFactory: (config: ConfigService, redisClient: Redis) => {
        return {
          throttlers: [
            {
              ttl: ms(config.get('THROTTLE_TTL') as string),
              limit: config.get<number>('THROTTLE_LIMIT') as number,
            },
          ],
          storage: new ThrottlerStorageRedisService(redisClient),
        };
      },
    }),
    AuthModule,
    FileParserModule,
    TransactionModule,
    TransactionCategorizerModule,
    UserModule,
    BankStatementModule,
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
    @Inject(REDIS) private readonly redisClient: Redis,
    private readonly config: ConfigService,
  ) {}

  async configure(consumer: MiddlewareConsumer) {
    const redisStore = new RedisStore({client: this.redisClient});

    const isProduction = this.config.get('NODE_ENV') === 'production';
    const secret = this.config.get('SESSION_SECRET');
    const expiration = this.config.get('SESSION_EXPIRATION');
    const expirationMs = ms(expiration as string);
    const webBaseUrl = this.config.get('WEB_BASE_URL');

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
            maxAge: expirationMs,
            ...(isProduction ? {domain: webBaseUrl} : {}),
          },
        }),
        passport.initialize(),
        passport.session(),
        SessionMiddleware,
      )
      .forRoutes('*');
  }
}
