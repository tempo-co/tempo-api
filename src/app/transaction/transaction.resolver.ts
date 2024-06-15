import { Resolver, Query, Args } from '@nestjs/graphql';
import { TransactionService } from './transaction.service';
import { Transaction } from './models/transaction.model';

@Resolver(() => Transaction)
export class TransactionResolver {
  constructor(private readonly transactionService: TransactionService) {}

  @Query(() => [Transaction])
  transactions(): Promise<Transaction[]> {
    return this.transactionService.findAll();
  }

  @Query(() => Transaction)
  transaction(@Args('id') id: string): Promise<Transaction | null> {
    return this.transactionService.findById(id);
  }
}
