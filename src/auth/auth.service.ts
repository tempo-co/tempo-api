import { Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AccessToken } from './dto/access-token.output';
import { plainToClass } from 'class-transformer';
import { User } from 'src/user/models/user.model';
import { CreateUserArgs } from 'src/user/dto/create-user.args';

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
    const existingUser = await this.userService.findByEmail(
      createUserArgs.email,
    );
    if (existingUser) {
      throw new Error('User already exists');
    }

    const hash = await argon2.hash(createUserArgs.password);
    createUserArgs.password = hash;

    const user = await this.userService.create(createUserArgs);
    return plainToClass(User, user);
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
