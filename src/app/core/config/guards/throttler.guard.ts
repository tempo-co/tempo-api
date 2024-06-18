import {ExecutionContext, Injectable} from '@nestjs/common';
import {GqlExecutionContext} from '@nestjs/graphql';
import {ThrottlerGuard} from '@nestjs/throttler';

/**
 * Used for rate limiting.
 * Overrides getRequestResponse to extract the req and res from GraphQL context.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext();
    return {req: ctx.req, res: ctx.res};
  }
}
