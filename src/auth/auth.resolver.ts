import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { User } from 'src/user/models/user.model';
import { UseGuards } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AccessToken } from './outputs/access-token.output';
import { LoginInput } from './inputs/login.input';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Resolver(() => User)
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Mutation(() => AccessToken)
  logIn(
    @Args('loginInput') _loginInput: LoginInput,
    @CurrentUser() user: User,
  ) {
    return this.authService.signAccessToken(user);
  }
}
