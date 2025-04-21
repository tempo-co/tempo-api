import {CanActivate, ExecutionContext, Injectable} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';

import {SessionService} from '../services/session.service';

@Injectable()
export class LocalLogInGuard extends AuthGuard('local') implements CanActivate {
  constructor(private readonly sessionService: SessionService) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const result = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest();

    await super.logIn(request);
    this.sessionService.initializeSessionMetadata(request);
    return result;
  }
}
