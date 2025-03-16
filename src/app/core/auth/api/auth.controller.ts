import {Body, Controller, HttpCode, Post, Req, UseGuards} from '@nestjs/common';
import {ApiResponse} from '@nestjs/swagger';
import {Throttle, minutes} from '@nestjs/throttler';
import {Request} from 'express';
import {User} from 'src/app/modules/user/user.entity';

import {CurrentUser} from '../decorators/current-user.decorator';
import {Public} from '../decorators/public.decorator';
import {SkipEmailVerification} from '../decorators/skip-email-verification.decorator';
import {LocalLogInGuard} from '../guards/local-login.guard';
import {AuthService} from '../services/auth.service';
import {EmailVerifierService} from '../services/email-verifier.service';
import {EmailChangeDto} from './email-change.dto';
import {EmailVerifyDto} from './email-verify.dto';
import {LogInDto} from './login.dto';
import {SignUpDto} from './signup.dto';

@Controller('auth')
@Throttle({default: {limit: 6, ttl: minutes(1)}})
export class AuthController {
  constructor(
    private readonly emailVerifierService: EmailVerifierService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @UseGuards(LocalLogInGuard)
  @Post('login')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User logged in.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'Invalid credentials.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async logIn(@Body() _dto: LogInDto, @CurrentUser() user: User) {
    return user;
  }

  @Post('logout')
  @SkipEmailVerification()
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User logged out.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async logOut(@Req() request: Request) {
    return this.authService.logOut(request);
  }

  @Public()
  @Post('signup')
  @SkipEmailVerification()
  @HttpCode(201)
  @ApiResponse({status: 201, description: 'User created.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 409, description: 'This email is already in use.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async signUp(@Body() dto: SignUpDto, @Req() request: Request) {
    return this.authService.signUp(dto, request);
  }

  @Post('signup/resend')
  @SkipEmailVerification()
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'Verification email sent.'})
  @ApiResponse({status: 400, description: 'Email is already verified.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async sendVerifyEmail(@CurrentUser() user: User) {
    return this.emailVerifierService.sendVerifyEmail(user);
  }

  @Public()
  @Post('signup/verify')
  @SkipEmailVerification()
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'Email verified.'})
  @ApiResponse({status: 400, description: 'Invalid or expired verification code.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async verifyEmail(@Body() dto: EmailVerifyDto, @Req() request: Request) {
    const user = await this.emailVerifierService.verify(dto.code);
    if (!request.isAuthenticated()) {
      await this.authService.logIn(user, request);
    }
    return {message: 'Email verified.'};
  }

  @Post('change-email/request')
  @ApiResponse({status: 200, description: 'Verification email sent.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 409, description: 'This email is already in use.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async requestEmailChange(@CurrentUser() user: User, @Body() dto: EmailChangeDto) {
    return this.emailVerifierService.requestEmailChange(user, dto);
  }

  @Post('change-email/verify')
  @ApiResponse({status: 200, description: 'Email changed.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 409, description: 'This email is already in use.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async verifyEmailChange(@CurrentUser() user: User, @Body() dto: EmailVerifyDto) {
    return this.emailVerifierService.verifyEmailChange(user, dto.code);
  }
}
