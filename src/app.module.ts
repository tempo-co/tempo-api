import {ClassSerializerInterceptor, Module} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ThrottlerGuard} from '@nestjs/throttler';

import {ConfigurationModule} from '@core/config/config.module';
import {DatabaseModule} from '@core/database/database.module';
import {EmailModule} from '@core/email/email.module';
import {QueueModule} from '@core/queue/queue.module';
import {RateLimitModule} from '@core/rate-limit/rate-limit.module';
import {RedisModule} from '@core/redis/redis.module';
import {SessionModule} from '@core/session/session.module';
import {AuthModule} from '@modules/auth/auth.module';
import {BankStatementModule} from '@modules/bank-statement/bank-statement.module';
import {FileParserModule} from '@modules/file/file-parser/file-parser.module';
import {TransactionCategorizerModule} from '@modules/transaction/transaction-categorizer/transaction-categorizer.module';
import {TransactionModule} from '@modules/transaction/transaction.module';
import {UserModule} from '@modules/user/user.module';

@Module({
  imports: [
    ConfigurationModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    SessionModule,
    RateLimitModule,
    EmailModule,
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
export class AppModule {}
