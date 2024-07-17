import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {User} from '@entities/user/user.entity';

import {Account} from './account.entity';

export type AccountSaveOptions = Omit<
  Account,
  'id' | 'balance' | 'transactions' | 'bankStatements'
>;

@Injectable()
export class AccountRepository {
  constructor(
    @InjectRepository(Account)
    private readonly repository: Repository<Account>,
  ) {}

  save(account: AccountSaveOptions): Promise<Account> {
    return this.repository.save(account);
  }

  findAllByUserId(userId: User['id']): Promise<Account[]> {
    return this.repository.findBy({user: {id: userId}});
  }

  findByAccountIdAndUserId(accountId: Account['id'], userId: User['id']): Promise<Account | null> {
    return this.repository.findOne({where: {id: accountId, user: {id: userId}}});
  }

  existsByUserIdAndAlias(userId: User['id'], alias: Account['alias']): Promise<boolean> {
    return this.repository.existsBy({user: {id: userId}, alias});
  }
}
