import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { TransactionModule } from './transaction/transaction.module';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { FileParserModule } from './file-parser/file-parser.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { User } from './user/entities/user.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      envFilePath: '.env.development',
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
        entities: [User],
      }),
    }),
    FileParserModule,
    TransactionModule,
    AuthModule,
    UserModule,
  ],
})
export class AppModule {}
