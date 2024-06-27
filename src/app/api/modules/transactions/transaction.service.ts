import {Injectable, NotFoundException} from '@nestjs/common';

import {Transaction} from '@entities/transaction/transaction.entity';
import {
  TransactionRepository,
  TransactionSaveOptions,
} from '@entities/transaction/transaction.repository';

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
}
