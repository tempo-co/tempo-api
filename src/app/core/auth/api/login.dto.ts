import {IsEmail, IsNotEmpty, IsString, Length, MaxLength, MinLength} from 'class-validator';

import {User} from '@entities/user/user.entity';

export class LogInDto {
  @IsNotEmpty()
  @IsEmail()
  @Length(1, 255)
  email: User['email'];

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: User['password'];
}
