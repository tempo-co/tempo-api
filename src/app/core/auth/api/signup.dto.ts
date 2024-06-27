import {IsEmail, IsString, Length} from 'class-validator';

export class SignUpDto {
  @IsString()
  @Length(1, 255)
  name: string;

  @IsEmail()
  @Length(1, 255)
  email: string;

  @Length(8, 255)
  password: string;
}
