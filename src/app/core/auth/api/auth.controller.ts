import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {ApiResponse} from '@nestjs/swagger';
import {Request, Response} from 'express';

import {User} from '@entities/user/user.entity';

import {CurrentUser} from '../decorators/current-user.decorator';
import {Public} from '../decorators/public.decorator';
import {LocalAuthGuard} from '../guards/local-auth.guard';
import {AuthService} from '../services/auth.service';
import {LogInDto} from './login.dto';
import {SignUpDto} from './signup.dto';
import {TokensDto} from './tokens.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User has been successfully logged in.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'Invalid credentials.'})
  async logIn(
    @Body() _dto: LogInDto,
    @CurrentUser() user: User,
    @Res({passthrough: true}) response: Response,
  ): Promise<TokensDto> {
    const tokens = await this.authService.generateTokens(user);

    response.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false, // set to true in production
      maxAge: 300000, // 5min
    });

    response.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false, // set to true in production
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14d
    });

    return tokens;
  }

  @Public()
  @Post('signup')
  @ApiResponse({status: 201, description: 'The user has been successfully created.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 409, description: 'An account with this email already exists.'})
  async signUp(
    @Body() dto: SignUpDto,
    @Res({passthrough: true}) response: Response,
  ): Promise<TokensDto> {
    const tokens = await this.authService.createUser(dto);

    response.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false, // set to true in production
      maxAge: 300000, // 5min
    });

    response.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false, // set to true in production
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14d
    });

    return tokens;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User has been successfully logged out.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  async logOut(@CurrentUser() user: User, @Res({passthrough: true}) response: Response) {
    response.clearCookie('access_token');
    response.clearCookie('refresh_token');
    await this.authService.revokeRefreshToken(user.id);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'Tokens have been successfully refreshed.'})
  @ApiResponse({status: 401, description: 'Missing or invalid refresh token.'})
  async refreshTokens(
    @Req() request: Request,
    @Res({passthrough: true}) response: Response,
  ): Promise<TokensDto> {
    const refreshToken = request.cookies?.refresh_token;

    if (!refreshToken || refreshToken.length === 0) {
      throw new UnauthorizedException();
    }
    const tokens = await this.authService.refreshTokens(refreshToken);

    response.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false, // set to true in production
      maxAge: 300000, // 5min
    });

    response.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false, // set to true in production
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14d
    });

    return tokens;
  }
}
