import {Args, ID, Query, Resolver} from '@nestjs/graphql';
import {UserService} from '../services/user.service';
import {TypeUser} from './user.type';
import {ParseUUIDPipe, UsePipes} from '@nestjs/common';

@Resolver(() => TypeUser)
export class UserQueriesResolver {
  constructor(private userService: UserService) {}

  @Query(() => [TypeUser])
  users(): Promise<TypeUser[]> {
    return this.userService.findAll();
  }

  @Query(() => TypeUser)
  @UsePipes(new ParseUUIDPipe({version: '4'}))
  user(@Args('id', {type: () => ID}) id: TypeUser['id']): Promise<TypeUser> {
    return this.userService.findById(id);
  }
}
