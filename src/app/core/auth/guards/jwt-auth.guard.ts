import {ExecutionContext, Injectable} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {IS_PUBLIC_KEY} from '../decorators/public.decorator';
import {AuthGuard} from '@nestjs/passport';
import {GqlExecutionContext} from '@nestjs/graphql';

/**
 * Checks for a JWT unless the route uses the @Public decorator.
 * Overrides getRequest to adapt the guard to work with GraphQL.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req;
  }
}
