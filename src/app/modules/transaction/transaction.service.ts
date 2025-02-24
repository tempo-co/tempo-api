import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {User} from '@modules/user/user.entity';

import {FilterDto} from './api/filter.dto';
import {PaginationDto} from './api/pagination.dto';
import {Transaction} from './transaction.entity';

type TransactionSaveOptions = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async findById(id: Transaction['id']) {
    const transaction = await this.transactionRepository.findOneBy({id});

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found.`);
    }
    return transaction;
  }

  async findAllByUserId(userId: User['id'], pagination: PaginationDto, filter: FilterDto) {
    const {pageIndex, pageSize} = pagination;
    const {categories} = filter;

    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .innerJoin('transaction.account', 'account')
      .innerJoin('account.user', 'user')
      .where('user.id = :userId', {userId})
      .orderBy('transaction.completedAt', 'DESC')
      .skip(pageIndex * pageSize)
      .take(pageSize);

    if (categories && categories.length > 0) {
      query.andWhere('transaction.category IN (:...categories)', {categories});
    }

    const [transactions, total] = await query.getManyAndCount();
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
