import {Injectable, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import * as argon2 from 'argon2';
import {AccessToken} from './dto/access-token.output';
import {User} from '../../entities/user/user.entity';
import {UserService} from '../../api/graphql/modules/users/services/user.service';
import {CreateUserArgs} from '../../api/graphql/modules/users/dto/create-user.args';

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
      throw new Error('Unauthorized');
    }

    return user;
  }

  async createUser(createUserArgs: CreateUserArgs): Promise<User> {
    const hash = await argon2.hash(createUserArgs.password);
    const user = {...createUserArgs, password: hash};

    return this.userService.create(user);
  }

  async signAccessToken(user: User): Promise<AccessToken> {
    const payload = {
      sub: user.id,
      email: user.email,
    };

    const jwt = await this.jwtService.signAsync(payload);
    return {access_token: jwt};
  }
}
