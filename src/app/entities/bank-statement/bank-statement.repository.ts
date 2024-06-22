import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {BankStatement} from './bank-statement.entity';

export type BankStatementSaveOptions = Omit<BankStatement, 'id' | 'transactions'>;

@Injectable()
export class BankStatementRepository {
  constructor(
    @InjectRepository(BankStatement)
    private readonly repository: Repository<BankStatement>,
  ) {}

  save(bankStatement: BankStatementSaveOptions): Promise<BankStatement> {
    return this.repository.save(bankStatement);
  }
}
