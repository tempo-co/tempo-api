import {Body, Controller, HttpCode, Post, Req, UseGuards} from '@nestjs/common';
import {ApiResponse} from '@nestjs/swagger';
import {Request} from 'express';

import {Public} from '../decorators/public.decorator';
import {LocalLogInGuard} from '../guards/local-login.guard';
import {AuthService} from '../services/auth.service';
import {LogInDto} from './login.dto';
import {SignUpDto} from './signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalLogInGuard)
  @Post('login')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User has been successfully logged in.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'Invalid credentials.'})
  async logIn(@Body() _dto: LogInDto) {}

  @Public()
  @Post('signup')
  @ApiResponse({status: 201, description: 'The user has been successfully created.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 409, description: 'An account with this email already exists.'})
  async signUp(@Body() dto: SignUpDto, @Req() request: Request) {
    const user = await this.authService.createUser(dto);

    await new Promise<void>((resolve) => {
      request.logIn(user, () => {
        resolve();
      });
    });
  }

  @Post('logout')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User has been successfully logged out.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  async logOut(@Req() request: Request) {
    await new Promise<void>((resolve) => {
      request.logOut({keepSessionInfo: false}, () => {
        resolve();
      });
    });
  }
}
