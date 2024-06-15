import { ConflictException, Injectable } from '@nestjs/common';
import { UserService } from 'src/app/user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AccessToken } from './dto/access-token.output';
import { plainToClass } from 'class-transformer';
import { User } from 'src/app/user/models/user.model';
import { CreateUserArgs } from 'src/app/user/dto/create-user.args';

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
      throw new ConflictException(`An account with this email already exists.`);
    }

    const hash = await argon2.hash(createUserArgs.password);
    const user = { ...createUserArgs, password: hash };

    const createdUser = await this.userService.create(user);
    return plainToClass(User, createdUser);
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
