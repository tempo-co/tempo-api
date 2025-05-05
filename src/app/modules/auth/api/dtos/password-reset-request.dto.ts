import {IsEmail, IsNotEmpty, Length} from 'class-validator';

import {Account} from '@modules/account/account.entity';

export class PasswordResetRequestDto {
	@IsNotEmpty()
	@IsEmail()
	@Length(1, 255)
	email: Account['email'];
}
