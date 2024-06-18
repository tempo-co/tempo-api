import {ExecutionContext, Injectable} from '@nestjs/common';
import {GqlExecutionContext} from '@nestjs/graphql';
import {AuthGuard} from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    const {email, password} = ctx.getArgs();
    const req = ctx.getContext().req;
    req.body.email = email;
    req.body.password = password;
    return req;
  }
}
