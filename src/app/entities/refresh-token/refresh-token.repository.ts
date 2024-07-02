import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {RefreshToken} from './refresh-token.entity';

@Injectable()
export class RefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repository: Repository<RefreshToken>,
  ) {}

  save(refreshToken: RefreshToken): Promise<RefreshToken> {
    return this.repository.save(refreshToken);
  }

  findByToken(token: RefreshToken['token']): Promise<RefreshToken | null> {
    return this.repository.findOne({where: {token}});
  }

  delete(token: RefreshToken['token']) {
    this.repository.delete({token});
  }
}
