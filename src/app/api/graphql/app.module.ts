import {TypeOrmModule} from '@nestjs/typeorm';
import {Module} from '@nestjs/common';
import {GraphQLModule} from '@nestjs/graphql';
import {ApolloDriver, ApolloDriverConfig} from '@nestjs/apollo';
import {TransactionModule} from './modules/transactions/transactions.module';
import {ApolloServerPluginLandingPageLocalDefault} from '@apollo/server/plugin/landingPage/default';
import {FileParserModule} from '../../core/file-parser/file-parser.module';
import {AuthModule} from '../../core/auth/auth.module';
import {UserModule} from './modules/users/users.module';
import {User} from '../../entities/user/user.entity';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {validate} from '../../core/config/env.validation';
import {ThrottlerModule, minutes} from '@nestjs/throttler';
import {APP_GUARD} from '@nestjs/core';
import {GqlThrottlerGuard} from '../../core/config/guards/throttler.guard';
import {Account} from '../../entities/account/account.entity';
import {Transaction} from '../../entities/transaction/transaction.entity';
import {BankStatement} from '../../entities/bank-statement/statement.entity';
import {Category} from '../../entities/category/category.entity';
import {BankStatementModule} from './modules/bank-statements/statements.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      envFilePath: ['.env.development.local', '.env.development'],
      cache: true,
      validationOptions: {
        allowUnknown: false,
        abortEarly: true,
      },
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: 'schema.gql',
      playground: false,
      introspection: true,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
      context: ({req, res}: {req: Request; res: Response}) => ({
        req,
        res,
      }),
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
        entities: [User, Account, Transaction, BankStatement, Category],
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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
  ],
})
export class AppModule {}
