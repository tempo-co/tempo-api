import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DeepPartial, Repository} from 'typeorm';

import {User} from '@entities/user/user.entity';

export type UserSaveOptions = Pick<User, 'name' | 'email' | 'password'>;

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  create(userPartial: DeepPartial<User>): User {
    return this.repository.create(userPartial);
  }

  findAll(): Promise<User[]> {
    return this.repository.find();
  }

  findById(id: User['id']): Promise<User | null> {
    return this.repository.findOne({
      where: {id},
      relations: ['accounts', 'accounts.transactions'],
    });
  }

  findByEmail(email: User['email']): Promise<User | null> {
    return this.repository.findOne({
      where: {email},
      relations: ['accounts', 'accounts.transactions'],
    });
  }

  save(user: UserSaveOptions): Promise<User> {
    return this.repository.save(user);
  }
}
