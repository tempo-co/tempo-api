import {Args, Query, Resolver} from '@nestjs/graphql';
import {UserService} from '../services/user.service';
import {User} from './user.model';

@Resolver(() => User)
export class UserResolver {
  constructor(private readonly userService: UserService) {}

  @Query(() => [User])
  async users(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Query(() => User)
  async user(@Args('id') id: string): Promise<User | null> {
    return this.userService.findById(id);
  }
}
