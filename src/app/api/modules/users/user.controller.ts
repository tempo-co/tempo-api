import {Controller, Get, Param, ParseUUIDPipe} from '@nestjs/common';

import {User} from '@entities/user/user.entity';

import {UserService} from './user.service';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({version: '4'})) id: User['id']): Promise<User> {
    return this.userService.findById(id);
  }
}
