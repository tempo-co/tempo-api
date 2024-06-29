import {Body, Controller, HttpCode, Post, UseGuards} from '@nestjs/common';
import {ApiResponse} from '@nestjs/swagger';

import {User} from '@entities/user/user.entity';

import {CurrentUser} from '../decorators/current-user.decorator';
import {Public} from '../decorators/public.decorator';
import {LocalAuthGuard} from '../guards/local-auth.guard';
import {AuthService} from '../services/auth.service';
import {AccessTokenDto} from './access-token.dto';
import {LogInDto} from './login.dto';
import {SignUpDto} from './signup.dto';

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
  logIn(@Body() _dto: LogInDto, @CurrentUser() user: User): Promise<AccessTokenDto> {
    return this.authService.signAccessToken(user);
  }

  @Public()
  @Post('signup')
  @ApiResponse({status: 201, description: 'The user has been successfully created.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 409, description: 'An account with this email already exists.'})
  signUp(@Body() dto: SignUpDto): Promise<AccessTokenDto> {
    return this.authService.createUser(dto);
  }
}
