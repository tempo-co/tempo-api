import {Resolver, Mutation, Args} from '@nestjs/graphql';
import {UseGuards} from '@nestjs/common';
import {User} from '@entities/user/user.entity';
import {Public} from '../decorators/public.decorator';
import {CurrentUser} from '../decorators/current-user.decorator';
import {LocalAuthGuard} from '../guards/local-auth.guard';
import {TypeAccessToken} from './access-token.type';
import {ArgsLogIn} from './login.args';
import {AuthService} from '../services/auth.service';
import {ArgsSignUp} from './signup.args';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Mutation(() => TypeAccessToken)
  async logIn(@Args() _args: ArgsLogIn, @CurrentUser() user: User) {
    const accessToken = await this.authService.signAccessToken(user);
    return accessToken;
  }

  @Public()
  @Mutation(() => TypeAccessToken)
  async signUp(@Args() args: ArgsSignUp) {
    const user = await this.authService.createUser(args);

    const accessToken = await this.authService.signAccessToken(user);
    return accessToken;
  }
}
