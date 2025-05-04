import {SessionData} from 'express-session';

import {Account} from '@modules/account/account.entity';

export interface AuthenticatedSession extends SessionData {
	passport?: {
		user?: Account['id'];
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
