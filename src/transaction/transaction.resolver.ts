import { Resolver, Query, Args } from '@nestjs/graphql';
import { TransactionService } from './transaction.service';
import { Transaction } from './model/transaction.model';

@Resolver(() => Transaction)
export class TransactionResolver {
  constructor(private transactionService: TransactionService) {}

  @Query(() => Transaction, { name: 'transaction' })
  async getTransaction(
    @Args('id', { type: () => String }) id: string,
  ): Promise<Transaction> {
    return this.transactionService.findOne(id);
  }

  @Query(() => [Transaction], { name: 'transactions' })
  async getTransactions(): Promise<Transaction[]> {
    return this.transactionService.findAll();
  }
}
