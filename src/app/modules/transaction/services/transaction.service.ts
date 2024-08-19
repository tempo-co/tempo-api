import {Injectable, NotFoundException} from '@nestjs/common';

import {TransactionRepository, TransactionSaveOptions} from '../repository/transaction.repository';
import {Transaction} from '../transaction.entity';

@Injectable()
export class TransactionService {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async findById(id: Transaction['id']): Promise<Transaction> {
    const transaction = await this.transactionRepository.findById(id);

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found.`);
    }
    return transaction;
  }

  saveAll(transactions: TransactionSaveOptions[]): Promise<Transaction[]> {
    if (transactions.length === 0) {
      return Promise.resolve([]);
    }
    return this.transactionRepository.saveAll(transactions);
  }

  deleteByIds(ids: Transaction['id'][]) {
    return this.transactionRepository.deleteByIds(ids);
  }
}
