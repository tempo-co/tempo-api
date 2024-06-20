import * as argon2 from 'argon2';
import {Repository} from 'typeorm';
import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {User} from '@entities/user/user.entity';

export type UserPartial = Pick<User, 'name' | 'email' | 'password'>;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findById(id: User['id']): Promise<User> {
    const user = await this.userRepository.findOne({where: {id}});

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }
    return user;
  }

  async findByEmail(email: User['id']): Promise<User> {
    const user = await this.userRepository.findOne({where: {email}});

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found.`);
    }
    return user;
  }

  async remove(id: User['id']): Promise<void> {
    await this.userRepository.delete(id);
  }

  async create(userPartial: UserPartial): Promise<User> {
    const {name, email, password} = userPartial;

    const existingUser = await this.userRepository.findOne({where: {email}});

    if (existingUser) {
      throw new ConflictException(`An account with this email already exists.`);
    }
    const hash = await argon2.hash(password);

    const user = {name, email, password: hash};
    return this.userRepository.save(user);
  }
}
