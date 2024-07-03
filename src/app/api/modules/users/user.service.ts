import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import argon2 from 'argon2';

import {User} from '@entities/user/user.entity';
import {UserRepository, UserSaveOptions} from '@entities/user/user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  async findById(id: User['id']): Promise<User> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }
    return user;
  }

  async findByEmail(email: User['id']): Promise<User> {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found.`);
    }
    return user;
  }

  async save(options: UserSaveOptions): Promise<User> {
    const {name, email, password} = options;

    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new ConflictException(`An account with this email already exists.`);
    }
    const hash = await argon2.hash(password);

    return this.userRepository.save({name, email, password: hash});
  }
}
