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

  findAll(): Promise<Transaction[]> {
    return this.repository.find();
  }

  findById(id: Transaction['id']): Promise<Transaction | null> {
    return this.repository.findOne({where: {id}});
  }

  saveAll(transactions: TransactionSaveOptions[]): Promise<Transaction[]> {
    return this.repository.save(transactions);
  }
}
