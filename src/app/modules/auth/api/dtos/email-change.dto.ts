import {IsEmail, IsNotEmpty, Length} from 'class-validator';

import {Account} from '@modules/account/account.entity';

export class EmailChangeRequestDto {
	@IsNotEmpty()
	@IsEmail()
	@Length(1, 255)
	newEmail: Account['email'];
}
