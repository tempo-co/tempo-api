import {IsEmail, IsNotEmpty, IsString, Length} from 'class-validator';

import {Account} from '@modules/account/account.entity';

export class SignUpDto {
	@IsNotEmpty()
	@IsString()
	@Length(1, 255)
	name: Account['name'];

	@IsNotEmpty()
	@IsEmail()
	@Length(1, 255)
	email: Account['email'];

	@IsNotEmpty()
	@IsString()
	@Length(8, 255)
	password: Account['password'];
}
