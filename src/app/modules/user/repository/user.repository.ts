import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {User} from '../user.entity';

export type UserSaveOptions = Omit<User, 'id' | 'createdAt' | 'accounts'>;

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  findById(id: User['id']): Promise<User | null> {
    return this.repository.findOneBy({id});
  }

  findByEmail(email: User['email']): Promise<User | null> {
    return this.repository.findOneBy({email});
  }

  save(user: UserSaveOptions): Promise<User> {
    return this.repository.save(user);
  }

  existsByEmail(email: User['email']): Promise<boolean> {
    return this.repository.existsBy({email});
  }
}
