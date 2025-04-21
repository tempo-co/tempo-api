import {IsEmail, IsNotEmpty, IsString, Length, MaxLength, MinLength} from 'class-validator';

import {User} from '@modules/user/user.entity';

export class EmailChangeDto {
  @IsNotEmpty()
  @IsEmail()
  @Length(1, 255)
  newEmail: User['email'];

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: User['password'];
}
