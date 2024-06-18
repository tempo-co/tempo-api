import {Repository} from 'typeorm';
import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Transaction} from '@entities/transaction/transaction.entity';
import {Account} from '@entities/account/account.entity';
import {InputTransactionCreate} from '../graphql/transaction-create.input';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  findAll(): Promise<Transaction[]> {
    return this.transactionRepository.find();
  }

  async findById(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({where: {id}});

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found.`);
    }
    return transaction;
  }

  create(dtos: InputTransactionCreate[], account: Account): Promise<Transaction[]> {
    const transactions = dtos.map((dto) => {
      const transaction = this.transactionRepository.create(dto);
      transaction.account = account;
      return transaction;
    });

    return this.transactionRepository.save(transactions);
  }
}
