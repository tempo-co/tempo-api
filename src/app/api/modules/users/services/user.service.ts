import {Repository} from 'typeorm';
import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {User} from '@entities/user/user.entity';
import {CreateUserArgs} from '../dto/create-user.args';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({where: {id}});

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User> {
    const user = await this.userRepository.findOne({where: {email}});

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found.`);
    }
    return user;
  }

  async remove(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

  async create(createUserArgs: CreateUserArgs): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: {email: createUserArgs.email},
    });

    if (existingUser) {
      throw new ConflictException(`An account with this email already exists.`);
    }
    return this.userRepository.save(createUserArgs);
  }
}
