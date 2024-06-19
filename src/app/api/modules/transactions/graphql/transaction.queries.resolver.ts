import {Resolver, Query, Args, ID} from '@nestjs/graphql';
import {TransactionService} from '../services/transaction.service';
import {TypeTransaction} from './transaction.type';

@Resolver(() => TypeTransaction)
export class TransactionResolver {
  constructor(private readonly transactionService: TransactionService) {}

  @Query(() => [TypeTransaction])
  transactions(): Promise<TypeTransaction[]> {
    return this.transactionService.findAll();
  }

  @Query(() => TypeTransaction)
  transaction(@Args('id', {type: () => ID}) id: TypeTransaction['id']): Promise<TypeTransaction> {
    return this.transactionService.findById(id);
  }
}
