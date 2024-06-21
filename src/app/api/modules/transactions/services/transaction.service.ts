import {Injectable, NotFoundException} from '@nestjs/common';

import {Transaction} from '@entities/transaction/transaction.entity';
import {TransactionRepository} from '@entities/transaction/transaction.repository';

export type TransactionPartial = Pick<
  Transaction,
  'startedDate' | 'completedDate' | 'description' | 'amount' | 'currency'
>;

@Injectable()
export class TransactionService {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async findAll(): Promise<Transaction[]> {
    return this.transactionRepository.findAll();
  }

  async findById(id: Transaction['id']): Promise<Transaction> {
    const transaction = await this.transactionRepository.findById(id);

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found.`);
    }
    return transaction;
  }

  saveAll(transactions: Transaction[]): Promise<Transaction[]> {
    return this.transactionRepository.saveAll(transactions);
  }
}
