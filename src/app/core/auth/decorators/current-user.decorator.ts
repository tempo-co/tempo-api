import {UnauthorizedException, createParamDecorator} from '@nestjs/common';
import {Request} from 'express';

/**
 * Extracts the current user from the request context.
 */
export const CurrentUser = createParamDecorator((_data, req: Request) => {
  if (!req.user) {
    throw new UnauthorizedException();
  }
  return req.user;
});
