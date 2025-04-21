import {SessionData} from 'express-session';

import {User} from '@modules/user/user.entity';

export interface AuthenticatedSession extends SessionData {
  passport?: {
    user?: User['id'];
  };
  metadata?: {
    ip: string;
    userAgent: string;
    deviceType: string;
    clientDescription: string;
    clientLocation: string;
    createdAt: string;
    lastSeenAt: string;
  };
}
