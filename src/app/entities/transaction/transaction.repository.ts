import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Transaction} from './transaction.entity';

export type TransactionSaveOptions = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable()
export class TransactionRepository {
  constructor(
    @InjectRepository(Transaction)
    private readonly repository: Repository<Transaction>,
  ) {}

  findById(id: Transaction['id']): Promise<Transaction | null> {
    return this.repository.findOneBy({id});
  }

  saveAll(transactions: TransactionSaveOptions[]): Promise<Transaction[]> {
    return this.repository.save(transactions);
  }

  deleteByIds(ids: Transaction['id'][]) {
    return this.repository.delete(ids);
  }
}
