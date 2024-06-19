import {Args, ID, Query, Resolver} from '@nestjs/graphql';
import {UserService} from '../services/user.service';
import {TypeUser} from './user.type';

@Resolver(() => TypeUser)
export class UserQueriesResolver {
  constructor(private userService: UserService) {}

  @Query(() => [TypeUser])
  async users(): Promise<TypeUser[]> {
    return this.userService.findAll();
  }

  @Query(() => TypeUser)
  async user(@Args('id', {type: () => ID}) id: TypeUser['id']): Promise<TypeUser> {
    return this.userService.findById(id);
  }
}
