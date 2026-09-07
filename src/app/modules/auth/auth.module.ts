import {Module} from '@nestjs/common';
import {APP_GUARD} from '@nestjs/core';
import {PassportModule} from '@nestjs/passport';

import {EmailModule} from '@core/email/email.module';
import {EmailService} from '@core/email/email.service';
import {RedisModule} from '@core/redis/redis.module';
import {AccountModule} from '@modules/account/account.module';

import {AuthController} from './api/auth.controller';
import {AuthGuard} from './guards/auth.guard';
import {AuthService} from './services/auth.service';
import {EmailVerifierService} from './services/email-verifier.service';
import {PasswordResetService} from './services/password-reset.service';
import {SessionSerializer} from './services/session.serializer';
import {SessionsModule} from './services/sessions.module';
import {LocalStrategy} from './strategies/local.strategy';

@Module({
	imports: [RedisModule, AccountModule, EmailModule, SessionsModule, PassportModule.register({session: true})],
	providers: [
		AuthService,
		EmailVerifierService,
		PasswordResetService,
		SessionSerializer,
		LocalStrategy,
		EmailService,
		{provide: APP_GUARD, useClass: AuthGuard},
	],
	controllers: [AuthController],
	// Re-exported so consumers of AuthModule (e.g. core SessionModule's middleware)
	// can still inject SessionService.
	exports: [SessionsModule],
})
export class AuthModule {}
