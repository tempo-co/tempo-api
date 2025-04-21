import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

export class EmailVerifyDto {
  @ApiProperty({example: '123456'})
  @IsNotEmpty()
  @Matches(/^[0-9]{6}$/, {message: 'Verification code must be 6 digits.'})
  code: string;
}
