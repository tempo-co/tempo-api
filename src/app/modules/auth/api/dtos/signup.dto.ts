import {IsEmail, IsNotEmpty, IsString, Length} from 'class-validator';

import {User} from '@modules/user/user.entity';

export class SignUpDto {
  @IsNotEmpty()
  @IsString()
  @Length(1, 255)
  username: User['username'];

  @IsNotEmpty()
  @IsEmail()
  @Length(1, 255)
  email: User['email'];

  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  password: User['password'];
}
