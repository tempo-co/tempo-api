import {Resolver, Mutation, Args} from '@nestjs/graphql';
import {UseGuards} from '@nestjs/common';
import {User} from '@entities/user/user.entity';
import {CreateUserArgs} from '@modules/users/dto/create-user.args';
import {Public} from './decorators/public.decorator';
import {CurrentUser} from './decorators/current-user.decorator';
import {LocalAuthGuard} from './guards/local-auth.guard';
import {AccessToken} from './dto/access-token.output';
import {LoginArgs} from './dto/login.args';
import {AuthService} from './auth.service';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Mutation(() => AccessToken)
  async logIn(@Args() _loginArgs: LoginArgs, @CurrentUser() user: User) {
    const accessToken = await this.authService.signAccessToken(user);
    return accessToken;
  }

  @Public()
  @Mutation(() => AccessToken)
  async signUp(@Args() createUserArgs: CreateUserArgs) {
    const user = await this.authService.createUser(createUserArgs);

    const accessToken = await this.authService.signAccessToken(user);
    return accessToken;
  }
}
