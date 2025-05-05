import {IsEmail, IsNotEmpty, Length} from 'class-validator';

export class EmailCheckDto {
	@IsNotEmpty()
	@IsEmail()
	@Length(1, 255)
	email: string;
}
