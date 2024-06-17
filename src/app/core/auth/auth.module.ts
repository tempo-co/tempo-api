import {Module} from '@nestjs/common';
import {AuthService} from './auth.service';
import {LocalStrategy} from './strategies/local.strategy';
import {PassportModule} from '@nestjs/passport';
import {JwtModule} from '@nestjs/jwt';
import {UserModule} from 'src/app/api/graphql/modules/users/users.module';
import {JwtStrategy} from './strategies/jwt.strategy';
import {APP_GUARD} from '@nestjs/core';
import {JwtAuthGuard} from './guards/jwt-auth.guard';
import {AuthResolver} from './auth.resolver';
import {ConfigModule, ConfigService} from '@nestjs/config';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        global: true,
        signOptions: {expiresIn: '60s'},
        secret: config.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    UserModule,
    ConfigModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    AuthResolver,
  ],
  exports: [AuthService],
})
export class AuthModule {}
