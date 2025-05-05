import {CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {Request} from 'express';

import {Account} from '@modules/account/account.entity';

import {EMAIL_NOT_VERIFIED} from '../api/constants/api-messages.constants';
import {IS_PUBLIC_KEY} from '../decorators/public.decorator';
import {SKIP_EMAIL_VERIFICATION_KEY} from '../decorators/skip-email-verification.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		if (isPublic) {
			return true;
		}

		const request = context.switchToHttp().getRequest() as Request;
		const user = request.user as Account; // const should be renamed to account and should come from request.user.account

		if (!request.isAuthenticated()) {
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
