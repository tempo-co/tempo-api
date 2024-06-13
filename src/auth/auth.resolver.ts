import { Resolver, Mutation } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { User } from 'src/user/models/user.model';
import { UseGuards } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthGuard } from '@nestjs/passport';

@Resolver(() => User)
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(AuthGuard('local'))
  @Mutation(() => User)
  async login(@CurrentUser() user: User) {
    return this.authService.login(user);
  }
}
