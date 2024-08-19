import {Controller, Get} from '@nestjs/common';

import {CurrentUser} from '@core/auth/decorators/current-user.decorator';

import {UserService} from '../services/user.service';
import {User} from '../user.entity';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  findOne(@CurrentUser() user: User): Promise<User> {
    return this.userService.findById(user.id);
  }
}
