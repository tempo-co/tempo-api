import { Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AccessToken } from './outputs/access-token.output';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.userService.findByEmail(email);

    if (user && (await argon2.verify(user.password, password))) {
      return user;
    }
    return null;
  }

  async signAccessToken(user: any): Promise<AccessToken> {
    const payload = {
      sub: user.id,
      email: user.email,
    };

    const jwt = await this.jwtService.signAsync(payload);
    return { access_token: jwt };
  }
}
