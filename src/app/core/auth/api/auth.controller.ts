import {Body, Controller, Post, UseGuards} from '@nestjs/common';

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
  async logIn(@Body() _dto: LogInDto, @CurrentUser() user: User): Promise<AccessTokenDto> {
    return await this.authService.signAccessToken(user);
  }

  @Public()
  @Post('signup')
  async signUp(@Body() dto: SignUpDto): Promise<AccessTokenDto> {
    return await this.authService.createUser(dto);
  }
}
