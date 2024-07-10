import {Injectable} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {Strategy} from 'passport-local';

import {User} from '@entities/user/user.entity';

import {LogInDto} from '../api/login.dto';
import {AuthService} from '../services/auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({usernameField: 'email'});
  }

  async validate(email: User['email'], password: User['password']): Promise<User> {
    const dto = new LogInDto();
    dto.email = email;
    dto.password = password;
    return this.authService.validateUser(dto);
  }
}
