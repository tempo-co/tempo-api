import {IsEmail, IsString, MaxLength, MinLength} from 'class-validator';

export class LogInDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: string;
}
