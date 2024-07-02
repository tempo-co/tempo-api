import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {APP_GUARD} from '@nestjs/core';
import {ThrottlerGuard, ThrottlerModule, minutes} from '@nestjs/throttler';
import {TypeOrmModule} from '@nestjs/typeorm';

import {AuthModule} from '@core/auth/auth.module';
import {validationSchema} from '@core/config/validation-schema';
import {FileParserModule} from '@core/file-parser/file-parser.module';
import {TransactionCategorizerModule} from '@core/transaction-categorizer/transaction-categorizer.module';
import {BankStatementModule} from '@modules/bank-statements/bank-statement.module';
import {TransactionModule} from '@modules/transactions/transaction.module';
import {UserModule} from '@modules/users/user.module';

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
        limit: 500,
      },
    ]),
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
  ],
})
export class AppModule {}
