import {Args, ArgsType, Field, ID, Query, Resolver} from '@nestjs/graphql';
import {UserService} from '../services/user.service';
import {TypeUser} from './user.type';
import {IsNotEmpty, IsUUID} from 'class-validator';

@ArgsType()
class UserArgs {
  @Field(() => ID)
  @IsNotEmpty()
  @IsUUID('4')
  id: TypeUser['id'];
}

@Resolver(() => TypeUser)
export class UserQueriesResolver {
  constructor(private userService: UserService) {}

  @Query(() => [TypeUser])
  async users(): Promise<TypeUser[]> {
    return this.userService.findAll();
  }

  @Query(() => TypeUser)
  async user(@Args() {id}: UserArgs): Promise<TypeUser> {
    return this.userService.findById(id);
  }
}
