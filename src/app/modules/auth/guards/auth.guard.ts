import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {Request} from 'express';

import {SessionService} from '@core/session/session.service';
import {Account} from '@modules/account/account.entity';

import {EMAIL_NOT_VERIFIED} from '../api/constants/api-messages.constants';
import {IS_PUBLIC_KEY} from '../decorators/public.decorator';
import {SKIP_EMAIL_VERIFICATION_KEY} from '../decorators/skip-email-verification.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
	private readonly logger = new Logger(AuthGuard.name);

	constructor(
		private readonly reflector: Reflector,
		private readonly sessionService: SessionService,
	) {}

	canActivate(context: ExecutionContext): boolean {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		if (isPublic) {
			return true;
		}

		const request = context.switchToHttp().getRequest() as Request;
		const user = request.user as Account;

		if (!request.isAuthenticated()) {
			const {reason, client} = this.sessionService.describeRejectedSession(request);
			const route = `${request.method} ${(request.route as {path?: string} | undefined)?.path ?? request.path}`;
			this.logger.warn(`Rejected session: reason=${reason} route=${route} client=${client}`);
			throw new UnauthorizedException();
		}

		const isSkipEmailVerification = this.reflector.getAllAndOverride<boolean>(SKIP_EMAIL_VERIFICATION_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		if (!isSkipEmailVerification && user && !user.isEmailVerified) {
			throw new ForbiddenException(EMAIL_NOT_VERIFIED);
		}

		return true;
	}
}
