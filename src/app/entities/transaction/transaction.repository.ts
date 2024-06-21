import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DeepPartial, Repository} from 'typeorm';

import {Transaction} from './transaction.entity';

@Injectable()
export class TransactionRepository {
  constructor(
    @InjectRepository(Transaction)
    private readonly repository: Repository<Transaction>,
  ) {}

  create(transactionPartial: DeepPartial<Transaction>): Transaction {
    return this.repository.create(transactionPartial);
  }

  findAll(): Promise<Transaction[]> {
    return this.repository.find();
  }

  findById(id: Transaction['id']): Promise<Transaction | null> {
    return this.repository.findOne({where: {id}});
  }

  save(transaction: Transaction): Promise<Transaction> {
    return this.repository.save(transaction);
  }

  saveAll(transactions: Transaction[]): Promise<Transaction[]> {
    return this.repository.save(transactions);
  }
}
