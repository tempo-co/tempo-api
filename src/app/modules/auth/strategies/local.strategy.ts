import {BadRequestException, Injectable, UnauthorizedException} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {plainToClass} from 'class-transformer';
import {validate} from 'class-validator';
import {Strategy} from 'passport-local';

import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {LogInDto} from '../api/dtos/login.dto';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UserService) {
    super({usernameField: 'email'});
  }

  async validate(email: User['email'], password: User['password']) {
    const credentials = plainToClass(LogInDto, {email, password});
    const errors = await validate(credentials);

    if (errors.length > 0) {
      const formattedErrors = errors.flatMap((err) => Object.values(err.constraints || {}));
      throw new BadRequestException(formattedErrors);
    }

    const user = await this.userService.findByEmail(credentials.email);
    if (!user) {
      throw new UnauthorizedException();
    }

    await this.userService.verifyPassword(user.password, credentials.password);
    return user;
  }
}
