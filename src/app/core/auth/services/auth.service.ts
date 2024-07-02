import {Injectable, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import * as argon2 from 'argon2';

import {RefreshTokenService} from '@core/refresh-token/refresh-token.service';
import {RefreshToken} from '@entities/refresh-token/refresh-token.entity';
import {User} from '@entities/user/user.entity';
import {UserSaveOptions} from '@entities/user/user.repository';
import {UserService} from '@modules/users/user.service';

import {TokensDto} from '../api/tokens.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.userService.findByEmail(email).catch(() => {
      throw new UnauthorizedException();
    });

    const isPasswordValid = await argon2.verify(user.password, password);

    if (!isPasswordValid) {
      throw new UnauthorizedException();
    }
    return user;
  }

  async createUser(options: UserSaveOptions): Promise<TokensDto> {
    const user = await this.userService.save(options);
    return await this.generateTokens(user);
  }

  async generateTokens(user: User): Promise<TokensDto> {
    const refreshToken = await this.refreshTokenService.save(user.id);

    const payload = {sub: user.id, email: user.email};
    const accessToken = await this.jwtService.signAsync(payload);

    return {access_token: accessToken, refresh_token: refreshToken.token};
  }

  async refreshTokens(refreshToken: RefreshToken['token']): Promise<TokensDto> {
    const validRefreshToken = await this.refreshTokenService.findByToken(refreshToken);
    return this.generateTokens(validRefreshToken.user);
  }

  async revokeRefreshToken(refreshToken: RefreshToken['token']) {
    this.refreshTokenService.delete(refreshToken);
  }
}
