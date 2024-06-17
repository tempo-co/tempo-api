import {Resolver, Query, Args} from '@nestjs/graphql';
import {TransactionService} from '../services/transaction.service';
import {Transaction} from 'src/app/entities/transaction/transaction.entity';

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
