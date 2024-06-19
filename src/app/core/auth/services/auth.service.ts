import * as argon2 from 'argon2';
import {Injectable, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {UserOptions, UserService} from '@modules/users/services/user.service';
import {User} from '@entities/user/user.entity';
import {TypeAccessToken} from '../graphql/access-token.type';

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

  async createUser(userOptions: UserOptions): Promise<User> {
    const {name, email, password} = userOptions;

    const hash = await argon2.hash(password);
    const user = {name, email, password: hash};

    return this.userService.create(user);
  }

  async signAccessToken(user: User): Promise<TypeAccessToken> {
    const payload = {sub: user.id, email: user.email};

    const jwt = await this.jwtService.signAsync(payload);
    return {access_token: jwt};
  }
}
