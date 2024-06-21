import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DeepPartial, Repository} from 'typeorm';

import {User} from '@entities/user/user.entity';

import {Account} from './account.entity';

@Injectable()
export class AccountRepository {
  constructor(
    @InjectRepository(Account)
    private readonly repository: Repository<Account>,
  ) {}

  create(accountPartial: DeepPartial<Account>): Account {
    return this.repository.create(accountPartial);
  }

  save(account: Account): Promise<Account> {
    return this.repository.save(account);
  }

  findAllByUserId(userId: User['id']): Promise<Account[]> {
    return this.repository.find({where: {user: {id: userId}}});
  }

  findById(id: Account['id']): Promise<Account | null> {
    return this.repository.findOne({where: {id}});
  }
}
