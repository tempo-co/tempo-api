import { Injectable } from '@nestjs/common';
import { Transaction } from './model/transaction.model';

@Injectable()
export class TransactionService {
  private transactions: Transaction[] = [
    {
      id: '1',
      startedDate: new Date(),
      completedDate: new Date(),
      startBalance: 1000,
      endBalance: 2000,
      description: 'Test transaction',
      amount: 1000,
      currency: 'EUR',
    },
  ];

  findOne(id: string): Transaction {
    const transaction = this.transactions.find(
      (transaction) => transaction.id === id,
    );
    if (!transaction) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    return transaction;
  }

  findAll(): Transaction[] {
    return this.transactions;
  }
}
