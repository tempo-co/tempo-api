import {IsNotEmpty, IsString, Length} from 'class-validator';

import {User} from '@modules/user/user.entity';

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  currentPassword: User['password'];

  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  newPassword: User['password'];
}
