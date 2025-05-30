import {Body, Controller, Delete, Get, Head, HttpCode, Param, Post, Query, Req, Res, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from '@nestjs/swagger';
import {Throttle, minutes} from '@nestjs/throttler';
import {Request, Response} from 'express';

import {TOO_MANY_REQUESTS} from '@core/rate-limit/api-messages.constants';
import {Account} from '@modules/account/account.entity';

import {CurrentUser} from '../decorators/current-user.decorator';
import {Public} from '../decorators/public.decorator';
import {SkipEmailVerification} from '../decorators/skip-email-verification.decorator';
import {LocalLogInGuard} from '../guards/local-login.guard';
import {AuthService} from '../services/auth.service';
import {EmailVerifierService} from '../services/email-verifier.service';
import {PasswordResetService} from '../services/password-reset.service';
import {SessionService} from '../services/session.service';
import {
	ALL_OTHER_SESSIONS_REVOKED,
	CANNOT_REVOKE_CURRENT_SESSION,
	EMAIL_ALREADY_IN_USE,
	EMAIL_ALREADY_VERIFIED,
	EMAIL_CHANGE_SUCCESS,
	EMAIL_INVALID_TOKEN,
	EMAIL_VERIFICATION_SENT,
	EMAIL_VERIFICATION_SUCCESS,
	INVALID_CREDENTIALS,
	INVALID_SESSION,
	LOGIN_SUCCESS,
	LOGOUT_SUCCESS,
	NO_OTHER_SESSIONS_TO_REVOKE,
	PASSWORD_CHANGE_SUCCESS,
	PASSWORD_RESET_CONFIRMATION,
	PASSWORD_RESET_INVALID_TOKEN,
	PASSWORD_RESET_SUCCESS,
	SESSION_REVOKE_SUCCESS,
	UNAUTHORIZED,
} from './constants/api-messages.constants';
import {EmailChangeVerifyDto} from './dtos/email-change-verify.dto';
import {EmailChangeRequestDto} from './dtos/email-change.dto';
import {EmailCheckDto} from './dtos/email-check.dto';
import {EmailVerifyDto} from './dtos/email-verify.dto';
import {LogInDto} from './dtos/login.dto';
import {PasswordChangeDto} from './dtos/password-change.dto';
import {PasswordResetRequestDto} from './dtos/password-reset-request.dto';
import {PasswordResetVerifyDto} from './dtos/password-reset-verify.dto';
import {SessionResponseDto} from './dtos/session-response.dto';
import {SessionRevokeDto} from './dtos/session-revoke.dto';
import {SignUpDto} from './dtos/signup.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	constructor(
		private readonly emailVerifierService: EmailVerifierService,
		private readonly authService: AuthService,
		private readonly sessionService: SessionService,
		private readonly passwordResetService: PasswordResetService,
	) {}

	@Public()
	@Post('signup')
	@HttpCode(201)
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 201, description: 'The created account'})
	@ApiResponse({status: 409, description: EMAIL_ALREADY_IN_USE})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Creates a new account.'})
	async signUp(@Body() dto: SignUpDto, @Req() request: Request) {
		return await this.authService.signUp(dto, request);
	}

	@Public()
	@Post('login')
	@HttpCode(200)
	@UseGuards(LocalLogInGuard)
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: LOGIN_SUCCESS})
	@ApiResponse({status: 401, description: INVALID_CREDENTIALS})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Logs in a user and starts a session.'})
	async logIn(@Body() _dto: LogInDto, @CurrentUser() user: Account) {
		return user;
	}

	@Post('logout')
	@HttpCode(200)
	@SkipEmailVerification()
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: LOGOUT_SUCCESS})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Logs out the current user and destroys the session.'})
	async logOut(@Req() request: Request, @Res({passthrough: true}) res: Response) {
		res.clearCookie('session');
		return await this.authService.logOut(request);
	}

	@Post('signup/resend')
	@HttpCode(200)
	@SkipEmailVerification()
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: EMAIL_VERIFICATION_SENT})
	@ApiResponse({status: 400, description: EMAIL_ALREADY_VERIFIED})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Resends the email verification code to the current user.'})
	async resendWelcomeEmail(@CurrentUser() user: Account) {
		return await this.emailVerifierService.sendWelcomeEmail(user);
	}

	@Public()
	@Post('signup/verify')
	@HttpCode(200)
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: EMAIL_VERIFICATION_SUCCESS})
	@ApiResponse({status: 400, description: EMAIL_INVALID_TOKEN})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: "Verifies an account's email using a code."})
	async verifyEmail(@Body() dto: EmailVerifyDto, @Req() request: Request) {
		const user = await this.emailVerifierService.verifySignup(dto.code, dto.email);
		if (!request.isAuthenticated()) {
			await this.authService.logIn(user, request);
		}
		return {message: EMAIL_VERIFICATION_SUCCESS};
	}

	@Head('change-email/check')
	@HttpCode(204)
	@Throttle({default: {limit: 10, ttl: minutes(1)}})
	@ApiResponse({status: 204, description: 'Email is available.'})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 409, description: EMAIL_ALREADY_IN_USE})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Checks if an email address is available for use.'})
	async checkEmailAvailability(@Query() query: EmailCheckDto) {
		return await this.emailVerifierService.checkEmailAvailability(query.email);
	}

	@Post('change-email/request')
	@HttpCode(200)
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: EMAIL_VERIFICATION_SENT})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 409, description: EMAIL_ALREADY_IN_USE})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: "Requests a change to the account's email."})
	async requestEmailChange(@CurrentUser() user: Account, @Body() dto: EmailChangeRequestDto) {
		return await this.emailVerifierService.requestEmailChange(user, dto.newEmail);
	}

	@Post('change-email/verify')
	@HttpCode(200)
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: EMAIL_CHANGE_SUCCESS})
	@ApiResponse({status: 400, description: EMAIL_INVALID_TOKEN})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 409, description: EMAIL_ALREADY_IN_USE})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Verifies the new email using a token.'})
	async verifyEmailChange(@CurrentUser() account: Account, @Body() dto: EmailChangeVerifyDto) {
		return await this.emailVerifierService.verifyEmailChange(account, dto.token, dto.email);
	}

	@Post('change-password')
	@HttpCode(200)
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: PASSWORD_CHANGE_SUCCESS})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Changes the password for the current account.'})
	async changePassword(@CurrentUser() user: Account, @Body() dto: PasswordChangeDto) {
		return await this.authService.changePassword(user, dto);
	}

	@Public()
	@Post('reset-password/request')
	@HttpCode(200)
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: PASSWORD_RESET_CONFIRMATION})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Requests a password reset via email.'})
	async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
		return this.passwordResetService.requestPasswordReset(dto.email);
	}

	@Public()
	@Post('reset-password/verify')
	@HttpCode(200)
	@Throttle({default: {limit: 5, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: PASSWORD_RESET_SUCCESS})
	@ApiResponse({status: 400, description: PASSWORD_RESET_INVALID_TOKEN})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Resets a password using a token.'})
	async resetPassword(@Body() dto: PasswordResetVerifyDto) {
		return this.passwordResetService.resetPassword(dto.newPassword, dto.token);
	}

	@Get('sessions')
	@HttpCode(200)
	@ApiResponse({status: 200, description: 'List of active sessions.', type: [SessionResponseDto]})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Retrieves all active sessions for the current account.'})
	async getSessions(@CurrentUser() user: Account, @Req() request: Request) {
		return await this.sessionService.getSessions(user.id, request.session.id);
	}

	@Delete('sessions/:sessionId')
	@HttpCode(200)
	@ApiResponse({status: 200, description: SESSION_REVOKE_SUCCESS})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 404, description: INVALID_SESSION})
	@ApiResponse({status: 409, description: CANNOT_REVOKE_CURRENT_SESSION})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Revokes a session.'})
	async revokeSession(@CurrentUser() user: Account, @Req() request: Request, @Param() dto: SessionRevokeDto) {
		return await this.sessionService.revokeSession(user.id, request.session.id, dto.sessionId);
	}

	@Delete('sessions')
	@HttpCode(200)
	@Throttle({default: {limit: 6, ttl: minutes(1)}})
	@ApiResponse({status: 200, description: `${ALL_OTHER_SESSIONS_REVOKED} or ${NO_OTHER_SESSIONS_TO_REVOKE}`})
	@ApiResponse({status: 401, description: UNAUTHORIZED})
	@ApiResponse({status: 429, description: TOO_MANY_REQUESTS})
	@ApiOperation({summary: 'Revokes all sessions except the current one.'})
	async revokeAllOtherSessions(@CurrentUser() user: Account, @Req() request: Request) {
		return await this.sessionService.revokeAllOtherSessions(user.id, request.session.id);
	}
}
