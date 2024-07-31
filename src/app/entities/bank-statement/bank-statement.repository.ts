import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Account} from '@entities/account/account.entity';
import {User} from '@entities/user/user.entity';

import {BankStatement} from './bank-statement.entity';

export type BankStatementSaveOptions = Omit<BankStatement, 'id' | 'transactions' | 'period'>;

@Injectable()
export class BankStatementRepository {
  constructor(
    @InjectRepository(BankStatement)
    private readonly repository: Repository<BankStatement>,
  ) {}

  save(bankStatement: BankStatementSaveOptions) {
    return this.repository.save(bankStatement);
  }

  findAllByAccountIdAndUserId(accountId: Account['id'], userId: User['id']) {
    return this.repository.find({
      where: {account: {id: accountId, user: {id: userId}}},
      relations: ['file', 'transactions'],
    });
  }

  findByIdAndUserId(id: BankStatement['id'], userId: User['id']) {
    return this.repository.findOne({
      where: {id: id, account: {user: {id: userId}}},
      relations: ['file', 'transactions'],
    });
  }

  deleteById(id: BankStatement['id']) {
    return this.repository.delete(id);
  }
}
