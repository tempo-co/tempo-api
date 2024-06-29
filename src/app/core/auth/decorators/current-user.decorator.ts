import {ExecutionContext, createParamDecorator} from '@nestjs/common';

/**
 * Extracts the current user from the request context.
 */
export const CurrentUser = createParamDecorator((_data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
