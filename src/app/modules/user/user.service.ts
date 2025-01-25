import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {Repository} from 'typeorm';

import {User} from './user.entity';

type UserSaveOptions = Omit<User, 'id' | 'createdAt' | 'accounts'>;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findById(id: User['id']): Promise<User> {
    const user = await this.userRepository.findOneBy({id});

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }
    return user;
  }

  async findByEmail(email: User['id']): Promise<User> {
    const user = await this.userRepository.findOneBy({email});

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found.`);
    }
    return user;
  }

  async save(options: UserSaveOptions): Promise<User> {
    const {name, email, password} = options;

    const emailExists = await this.userRepository.existsBy({email});

    if (emailExists) {
      throw new ConflictException(`An account with email ${email} already exists.`);
    }
    const hash = await argon2.hash(password);

    return this.userRepository.save({name, email, password: hash});
  }
}
