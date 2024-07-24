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

  save(bankStatement: BankStatementSaveOptions): Promise<BankStatement> {
    return this.repository.save(bankStatement);
  }

  findAllByUserIdAndAccountId(
    userId: User['id'],
    accountId: Account['id'],
  ): Promise<BankStatement[]> {
    return this.repository.find({
      where: {account: {id: accountId, user: {id: userId}}},
      relations: ['file', 'transactions'],
    });
  }
}
