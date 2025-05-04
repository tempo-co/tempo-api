import {ApiProperty} from '@nestjs/swagger';
import {IsEmail, IsNotEmpty, Length, Matches} from 'class-validator';

import {Account} from '@modules/account/account.entity';

export class EmailVerifyDto {
	@ApiProperty({example: '123456'})
	@IsNotEmpty()
	@Matches(/^[0-9]{6}$/, {message: 'Verification code must be 6 digits.'})
	code: string;

	@IsNotEmpty()
	@IsEmail()
	@Length(1, 255)
	email: Account['email'];
}
