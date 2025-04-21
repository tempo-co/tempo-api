import {SessionData} from 'express-session';

import {User} from '@modules/user/user.entity';

export interface AuthenticatedSession extends SessionData {
  passport?: {
    user?: User['id'];
  };
  metadata?: {
    ip: string;
    userAgent: string;
    clientDescription: string;
    createdAt: string;
    lastSeen: string;
  };
}
