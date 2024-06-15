import { Injectable } from '@nestjs/common';
import { UserService } from 'src/app/user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AccessToken } from './dto/access-token.output';
import { CreateUserArgs } from 'src/app/user/dto/create-user.args';
import { User } from '../user/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userService.findByEmail(email);

    if (user && (await argon2.verify(user.password, password))) {
      return user;
    }
    return null;
  }

  async createUser(createUserArgs: CreateUserArgs): Promise<User> {
    const hash = await argon2.hash(createUserArgs.password);
    const user = { ...createUserArgs, password: hash };

    return this.userService.create(user);
  }

  async signAccessToken(user: User): Promise<AccessToken> {
    const payload = {
      sub: user.id,
      email: user.email,
    };

    const jwt = await this.jwtService.signAsync(payload);
    return { access_token: jwt };
  }
}
