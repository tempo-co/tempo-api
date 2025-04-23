import {IsNotEmpty, IsString, Length, MaxLength, MinLength} from 'class-validator';

import {User} from '@modules/user/user.entity';

export class SessionRevokeDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: User['password'];
}

export class SessionRevokeParamsDto {
  @IsString()
  @Length(32, 32)
  sessionId: string;
}
