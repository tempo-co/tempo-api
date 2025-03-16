import {IsNotEmpty, Length, Matches} from 'class-validator';

export class EmailVerifyDto {
  @IsNotEmpty()
  @Length(6, 6, {message: 'Verification code must be exactly 6 digits.'})
  @Matches(/^[0-9]{6}$/, {message: 'Verification code must contain only digits.'})
  code: string;
}
