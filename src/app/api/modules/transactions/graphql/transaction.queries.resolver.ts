import {Resolver, Query, Args, ID, ArgsType, Field} from '@nestjs/graphql';
import {TransactionService} from '../services/transaction.service';
import {TypeTransaction} from './transaction.type';
import {IsNotEmpty, IsUUID} from 'class-validator';

@ArgsType()
class TransactionArgs {
  @Field(() => ID)
  @IsNotEmpty()
  @IsUUID('4')
  id: TypeTransaction['id'];
}

@Resolver(() => TypeTransaction)
export class TransactionResolver {
  constructor(private readonly transactionService: TransactionService) {}

  @Query(() => [TypeTransaction])
  transactions(): Promise<TypeTransaction[]> {
    return this.transactionService.findAll();
  }

  @Query(() => TypeTransaction)
  transaction(@Args() {id}: TransactionArgs): Promise<TypeTransaction> {
    return this.transactionService.findById(id);
  }
}
