import {Controller, Get} from '@nestjs/common';

import {CurrentUser} from '@core/auth/decorators/current-user.decorator';
import {User} from '@entities/user/user.entity';

import {UserService} from './user.service';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Get('me')
  findOne(@CurrentUser() user: User): Promise<User> {
    return this.userService.findById(user.id);
  }
}
