import {Body, Controller, Get, Patch} from '@nestjs/common';

import {CurrentUser} from '@core/auth/decorators/current-user.decorator';
import {SkipEmailVerification} from '@core/auth/decorators/skip-email-verification.decorator';

import {User} from '../user.entity';
import {UserService} from '../user.service';
import {UserUpdateDto} from './user-update.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @SkipEmailVerification()
  findOne(@CurrentUser() user: User): Promise<User> {
    return this.userService.findById(user.id);
  }

  @Patch('me')
  update(@Body() dto: UserUpdateDto, @CurrentUser() user: User) {
    return this.userService.update(user.id, {name: dto.name});
  }
}
