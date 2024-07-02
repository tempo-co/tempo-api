import {Injectable, UnauthorizedException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import * as argon2 from 'argon2';
import ms from 'ms';

import {RefreshToken} from '@entities/refresh-token/refresh-token.entity';
import {RefreshTokenRepository} from '@entities/refresh-token/refresh-token.repository';
import {User} from '@entities/user/user.entity';
import {UserService} from '@modules/users/user.service';

@Injectable()
export class RefreshTokenService {
  private readonly REFRESH_TOKEN_EXPIRATION: string;

  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    this.REFRESH_TOKEN_EXPIRATION =
      this.configService.get<string>('REFRESH_TOKEN_EXPIRATION') || '14d';
  }

  async save(userId: User['id']): Promise<RefreshToken> {
    const user = await this.userService.findById(userId).catch(() => {
      throw new UnauthorizedException();
    });

    const refreshToken = crypto.randomUUID();
    const hash = await argon2.hash(refreshToken);

    const expiryDate = new Date(Date.now() + ms(this.REFRESH_TOKEN_EXPIRATION));

    return this.refreshTokenRepository.save({user, token: hash, expiresAt: expiryDate});
  }

  async findByToken(token: RefreshToken['token']): Promise<RefreshToken> {
    const refreshToken = await this.refreshTokenRepository.findByToken(token);

    if (!refreshToken) {
      throw new UnauthorizedException();
    }

    const isExpired = refreshToken.expiresAt <= new Date();
    const isValid = await argon2.verify(token, refreshToken.token);

    if (isExpired || !isValid) {
      throw new UnauthorizedException();
    }
    return refreshToken;
  }

  async delete(token: RefreshToken['token']) {
    this.refreshTokenRepository.delete(token);
  }
}
