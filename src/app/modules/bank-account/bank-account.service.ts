import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {BankAccountCreateDto} from './api/bank-account-create.dto';
import {BankAccount} from './bank-account.entity';

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    private readonly userService: UserService,
  ) {}

  async save(dto: BankAccountCreateDto, userId: User['id']): Promise<BankAccount> {
    const user = await this.userService.findById(userId);
    return this.bankAccountRepository.save({...dto, user});
  }

  async findAllByUserId(userId: User['id']) {
    return this.bankAccountRepository.findBy({user: {id: userId}});
  }

  async findById(id: BankAccount['id'], userId: User['id']) {
    const bankAccount = await this.bankAccountRepository.findOneBy({id, user: {id: userId}});

    if (!bankAccount) {
      throw new NotFoundException(`Bank account not found.`);
    }
    return bankAccount;
  }
}
