import {Repository} from 'typeorm';
import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Transaction} from '@entities/transaction/transaction.entity';
import {Account} from '@entities/account/account.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  findAll(): Promise<Transaction[]> {
    return this.transactionRepository.find();
  }

  async findById(id: Transaction['id']): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({where: {id}});

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found.`);
    }
    return transaction;
  }

  create(partialTransactions: Partial<Transaction>[], account: Account): Promise<Transaction[]> {
    const transactions = partialTransactions.map((partialTransaction) =>
      this.transactionRepository.create({...partialTransaction, account}),
    );

    return this.transactionRepository.save(transactions);
  }
}
