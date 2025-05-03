import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from '@nestjs/swagger';
import {Throttle, minutes} from '@nestjs/throttler';
import {Request, Response} from 'express';

import {User} from '@modules/user/user.entity';

import {CurrentUser} from '../decorators/current-user.decorator';
import {Public} from '../decorators/public.decorator';
import {SkipEmailVerification} from '../decorators/skip-email-verification.decorator';
import {LocalLogInGuard} from '../guards/local-login.guard';
import {AuthService} from '../services/auth.service';
import {EmailVerifierService} from '../services/email-verifier.service';
import {SessionService} from '../services/session.service';
import {ChangePasswordDto} from './dtos/change-password.dto';
import {EmailChangeDto} from './dtos/email-change.dto';
import {EmailVerifyDto} from './dtos/email-verify.dto';
import {LogInDto} from './dtos/login.dto';
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
  ) {}

  @Public()
  @Post('signup')
  @HttpCode(201)
  @SkipEmailVerification()
  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @ApiResponse({status: 201, description: 'User created.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 409, description: 'This email is already in use.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: 'Registers a new user'})
  async signUp(@Body() dto: SignUpDto, @Req() request: Request) {
    return this.authService.signUp(dto, request);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(LocalLogInGuard)
  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @ApiResponse({status: 200, description: 'User logged in.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'Invalid credentials.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: 'Logs in a user and starts a session'})
  async logIn(@Body() _dto: LogInDto, @CurrentUser() user: User) {
    return user;
  }

  @Post('logout')
  @HttpCode(200)
  @SkipEmailVerification()
  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @ApiResponse({status: 200, description: 'User logged out.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: 'Logs out the current user and destroys the session'})
  async logOut(@Req() request: Request, @Res({passthrough: true}) res: Response) {
    res.clearCookie('session');
    return this.authService.logOut(request);
  }

  @Post('change-password')
  @HttpCode(200)
  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @ApiResponse({status: 200, description: 'Password changed.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({
    status: 401,
    description: 'User is not logged in or current password is incorrect.',
  })
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: 'Changes the password for the current user'})
  async changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }

  @Post('signup/resend')
  @HttpCode(200)
  @SkipEmailVerification()
  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @ApiResponse({status: 200, description: 'Verification email sent.'})
  @ApiResponse({status: 400, description: 'Email is already verified.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: 'Resends the email verification code to the current user'})
  async sendVerifyEmail(@CurrentUser() user: User) {
    return this.emailVerifierService.sendVerifyEmail(user);
  }

  @Public()
  @Post('signup/verify')
  @HttpCode(200)
  @SkipEmailVerification()
  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @ApiResponse({status: 200, description: 'Email verified.'})
  @ApiResponse({status: 400, description: 'Invalid or expired verification code.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: "Verifies a user's email using a code"})
  async verifyEmail(@Body() dto: EmailVerifyDto, @Req() request: Request) {
    const user = await this.emailVerifierService.verify(dto.code);
    if (!request.isAuthenticated()) {
      await this.authService.logIn(user, request);
    }
    return {message: 'Email verified.'};
  }

  @Post('change-email/request')
  @HttpCode(200)
  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @ApiResponse({status: 200, description: 'Verification email sent.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'User is not logged in or password is incorrect.'})
  @ApiResponse({status: 409, description: 'This email is already in use.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: "Requests a change to the user's email"})
  async requestEmailChange(@CurrentUser() user: User, @Body() dto: EmailChangeDto) {
    return this.emailVerifierService.requestEmailChange(user, dto);
  }

  @Post('change-email/verify')
  @HttpCode(200)
  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @ApiResponse({status: 200, description: 'Email changed.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed or invalid code.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 409, description: 'This email is already in use.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: 'Verifies the new email using a code'})
  async verifyEmailChange(@CurrentUser() user: User, @Body() dto: EmailVerifyDto) {
    return this.emailVerifierService.verifyEmailChange(user, dto.code);
  }

  @Get('sessions')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'List of active sessions.', type: [SessionResponseDto]})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: 'Retrieves all active sessions for the current user'})
  async getSessions(@CurrentUser() user: User, @Req() request: Request) {
    return this.sessionService.getSessions(user.id, request.session.id);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'Session revoked.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 404, description: 'Session not found or expired.'})
  @ApiResponse({status: 409, description: 'Cannot revoke the current session. Log out instead.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: 'Revokes a user session.'})
  async revokeSession(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Param() dto: SessionRevokeDto,
  ) {
    return this.sessionService.revokeSession(user.id, request.session.id, dto.sessionId);
  }

  @Delete('sessions')
  @HttpCode(200)
  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @ApiResponse({status: 200, description: 'All other sessions revoked.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  @ApiOperation({summary: 'Revokes all sessions except the current one.'})
  async revokeAllOtherSessions(@CurrentUser() user: User, @Req() request: Request) {
    return await this.sessionService.revokeAllOtherSessions(user.id, request.session.id);
  }
}
