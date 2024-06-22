import {UseGuards} from '@nestjs/common';
import {Args, Mutation, Resolver} from '@nestjs/graphql';

import {User} from '@entities/user/user.entity';

import {CurrentUser} from '../decorators/current-user.decorator';
import {Public} from '../decorators/public.decorator';
import {LocalAuthGuard} from '../guards/local-auth.guard';
import {AuthService} from '../services/auth.service';
import {TypeAccessToken} from './access-token.type';
import {ArgsLogIn} from './login.args';
import {ArgsSignUp} from './signup.args';

@Resolver()
export class AuthMutationsResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Mutation(() => TypeAccessToken)
  async logIn(@Args() _args: ArgsLogIn, @CurrentUser() user: User) {
    return await this.authService.signAccessToken(user);
  }

  @Public()
  @Mutation(() => TypeAccessToken)
  async signUp(@Args() args: ArgsSignUp) {
    return await this.authService.createUser(args);
  }
}
