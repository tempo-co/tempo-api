import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { TransactionModule } from '../../transaction/transaction.module';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { FileParserModule } from '../../file-parser/file-parser.module';
import { AuthModule } from '../../auth/auth.module';
import { UserModule } from '../../user/user.module';
import { User } from '../../entities/user/user.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from '../../../config/env.validation';
import { ThrottlerModule, minutes } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { GqlThrottlerGuard } from '../../../config/guards/throttler.guard';
import { Account } from '../../entities/account/account.entity';
import { Transaction } from '../../entities/transaction/transaction.entity';
import { Statement } from '../../entities/statement/statement.entity';
import { Category } from '../../entities/category/category.entity';
import { StatementModule } from '../../statement/statement.module';

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
      context: ({ req, res }: { req: Request; res: Response }) => ({
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
        entities: [User, Account, Transaction, Statement, Category],
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
    StatementModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
  ],
})
export class AppModule {}
