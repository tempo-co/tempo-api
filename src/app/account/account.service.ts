import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { CreateAccountArgs } from './dto/create-account.args';
import { UserService } from '../user/user.service';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly userService: UserService,
  ) {}

  async create(
    createAccountArgs: CreateAccountArgs,
    userId: string,
  ): Promise<Account> {
    const user = await this.userService.findById(userId);

    const account = this.accountRepository.create({
      ...createAccountArgs,
      user,
    });
    return this.accountRepository.save(account);
  }

  async findAllByUserId(userId: string): Promise<Account[]> {
    return this.accountRepository.find({ where: { user: { id: userId } } });
  }
}
