import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {APP_GUARD} from '@nestjs/core';
import {PassportModule} from '@nestjs/passport';

import {UserModule} from '@modules/user/user.module';

import {AuthController} from './api/auth.controller';
import {AuthGuard} from './guards/auth.guard';
import {SessionSerializer} from './services/session.serializer';
import {LocalStrategy} from './strategies/local.strategy';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    PassportModule.register({
      session: true,
    }),
  ],
  providers: [
    SessionSerializer,
    LocalStrategy,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  controllers: [AuthController],
})
export class AuthModule {}
