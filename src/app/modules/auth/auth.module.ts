import {Module} from '@nestjs/common';
import {APP_GUARD} from '@nestjs/core';
import {PassportModule} from '@nestjs/passport';

import {EmailModule} from '@core/email/email.module';
import {EmailService} from '@core/email/email.service';
import {UserModule} from '@modules/user/user.module';

import {AuthController} from './api/auth.controller';
import {AuthGuard} from './guards/auth.guard';
import {AuthService} from './services/auth.service';
import {EmailVerifierService} from './services/email-verifier.service';
import {SessionSerializer} from './services/session.serializer';
import {SessionService} from './services/session.service';
import {LocalStrategy} from './strategies/local.strategy';

@Module({
  imports: [UserModule, EmailModule, PassportModule.register({session: true})],
  providers: [
    AuthService,
    SessionService,
    EmailVerifierService,
    SessionSerializer,
    LocalStrategy,
    EmailService,
    {provide: APP_GUARD, useClass: AuthGuard},
  ],
  controllers: [AuthController],
  exports: [SessionService],
})
export class AuthModule {}
