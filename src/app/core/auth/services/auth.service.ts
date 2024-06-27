import {Injectable, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import * as argon2 from 'argon2';

import {User} from '@entities/user/user.entity';
import {UserSaveOptions} from '@entities/user/user.repository';
import {UserService} from '@modules/users/user.service';

import {AccessTokenDto} from '../api/access-token.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    let user: User;

    try {
      user = await this.userService.findByEmail(email);
    } catch (error) {
      throw new UnauthorizedException();
    }

    const passwordMatches = await argon2.verify(user.password, password);

    if (!passwordMatches) {
      throw new UnauthorizedException();
    }
    return user;
  }

  async createUser(options: UserSaveOptions): Promise<AccessTokenDto> {
    const user = await this.userService.save(options);
    return await this.signAccessToken(user);
  }

  async signAccessToken(user: User): Promise<AccessTokenDto> {
    const payload = {sub: user.id, email: user.email};

    const jwt = await this.jwtService.signAsync(payload);
    return {access_token: jwt};
  }
}
