import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DeepPartial, Repository} from 'typeorm';

import {BankStatement} from './bank-statement.entity';

@Injectable()
export class BankStatementRepository {
  constructor(
    @InjectRepository(BankStatement)
    private readonly repository: Repository<BankStatement>,
  ) {}

  create(bankStatementPartial: DeepPartial<BankStatement>): BankStatement {
    return this.repository.create(bankStatementPartial);
  }

  save(bankStatement: BankStatement): Promise<BankStatement> {
    return this.repository.save(bankStatement);
  }
}
