import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {User} from '@modules/user/user.entity';

import {PaginationDto} from './api/pagination.dto';
import {Transaction} from './transaction.entity';

type TransactionSaveOptions = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async findById(id: Transaction['id']): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOneBy({id});

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found.`);
    }
    return transaction;
  }

  async findAllByUserId(
    userId: User['id'],
    {pageIndex, pageSize}: PaginationDto,
  ): Promise<{
    transactions: Transaction[];
    total: number;
  }> {
    const [transactions, total] = await this.transactionRepository
      .createQueryBuilder('transaction')
      .innerJoin('transaction.account', 'account')
      .innerJoin('account.user', 'user')
      .where('user.id = :userId', {userId})
      .orderBy('transaction.completedAt', 'DESC')
      .skip(pageIndex * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {transactions, total};
  }

  async saveAll(transactions: TransactionSaveOptions[]): Promise<Transaction[]> {
    if (transactions.length === 0) {
      return Promise.resolve([]);
    }
    return this.transactionRepository.save(transactions);
  }

  async deleteByIds(ids: Transaction['id'][]) {
    return this.transactionRepository.delete(ids);
  }
}
