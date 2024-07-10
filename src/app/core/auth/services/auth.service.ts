import {BadRequestException, Injectable, UnauthorizedException} from '@nestjs/common';
import argon2 from 'argon2';
import {validate} from 'class-validator';

import {User} from '@entities/user/user.entity';
import {UserSaveOptions} from '@entities/user/user.repository';
import {UserService} from '@modules/users/user.service';

import {LogInDto} from '../api/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly userService: UserService) {}

  async validateUser(dto: LogInDto): Promise<User> {
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

  async createUser(options: UserSaveOptions): Promise<User> {
    return this.userService.save(options);
  }
}
