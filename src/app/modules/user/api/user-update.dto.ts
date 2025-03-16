import {IsString, Length} from 'class-validator';

import {User} from '../user.entity';

export class UserUpdateDto {
  @IsString()
  @Length(1, 255)
  name: User['name'];
}
