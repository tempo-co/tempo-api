import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { User } from 'src/app/user/models/user.model';
import { UseGuards } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AccessToken } from './dto/access-token.output';
import { LoginArgs } from './dto/login.args';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { CreateUserArgs } from 'src/app/user/dto/create-user.args';

@Resolver(() => User)
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
