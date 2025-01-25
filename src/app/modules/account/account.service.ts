import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {Account} from './account.entity';
import {AccountCreateDto} from './api/account-create.dto';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly userService: UserService,
  ) {}

  async save(dto: AccountCreateDto, userId: User['id']): Promise<Account> {
    const user = await this.userService.findById(userId);

    if (dto.alias) {
      const aliasExists = await this.accountRepository.existsBy({
        user: {id: userId},
        alias: dto.alias,
      });

      if (aliasExists) {
        throw new ConflictException(`Account with alias ${dto.alias} already exists.`);
      }
    }
    return this.accountRepository.save({...dto, user});
  }

  async findAllByUserId(userId: User['id']): Promise<Account[]> {
    return this.accountRepository.findBy({user: {id: userId}});
  }

  async findById(accountId: Account['id'], userId: User['id']): Promise<Account> {
    const account = await this.accountRepository.findOneBy({id: accountId, user: {id: userId}});

    if (!account) {
      throw new NotFoundException(`Account with id ${accountId} not found.`);
    }
    return account;
  }
}
