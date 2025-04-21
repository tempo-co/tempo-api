export class SessionDto {
  id: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  lastSeen: string;
  isCurrent: boolean;
}
