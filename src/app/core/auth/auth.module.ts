import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {APP_GUARD} from '@nestjs/core';
import {JwtModule} from '@nestjs/jwt';
import {PassportModule} from '@nestjs/passport';

import {UserModule} from '@modules/users/user.module';

import {AuthController} from './api/auth.controller';
import {JwtAuthGuard} from './guards/jwt-auth.guard';
import {AuthService} from './services/auth.service';
import {JwtStrategy} from './strategies/jwt.strategy';
import {LocalStrategy} from './strategies/local.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        global: true,
        signOptions: {expiresIn: '10000s'},
        secret: config.get<string>('JWT_SECRET'),
      }),
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
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
