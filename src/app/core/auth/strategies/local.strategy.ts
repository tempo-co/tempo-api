import {BadRequestException, Injectable, UnauthorizedException} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import argon2 from 'argon2';
import {plainToClass} from 'class-transformer';
import {validate} from 'class-validator';
import {Strategy} from 'passport-local';

import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {LogInDto} from '../api/login.dto';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UserService) {
    super({usernameField: 'email'});
  }

  async validate(email: User['email'], password: User['password']): Promise<User> {
    const dto = plainToClass(LogInDto, {email, password});

    const errors = await validate(dto);

    if (errors.length > 0) {
      const formattedErrors = errors.flatMap((err) => Object.values(err.constraints || {}));
      throw new BadRequestException(formattedErrors);
    }

    const user = await this.userService.findByEmail(dto.email).catch(() => {
      throw new UnauthorizedException();
    });

    const isPasswordValid = await argon2.verify(user.password, dto.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
