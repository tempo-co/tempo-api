import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';

import {UserService} from '@modules/user/services/user.service';
import {User} from '@modules/user/user.entity';

import {Account} from '../account.entity';
import {AccountCreateDto} from '../api/account-create.dto';
import {AccountRepository} from '../repository/account.repository';

@Injectable()
export class AccountService {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly userService: UserService,
  ) {}

  async save(dto: AccountCreateDto, userId: User['id']): Promise<Account> {
    const user = await this.userService.findById(userId);

    if (dto.alias) {
      const aliasExists = await this.accountRepository.existsByUserIdAndAlias(userId, dto.alias);

      if (aliasExists) {
        throw new ConflictException(`Account with alias ${dto.alias} already exists.`);
      }
    }
    return this.accountRepository.save({...dto, user});
  }

  async findAllByUserId(userId: User['id']): Promise<Account[]> {
    return this.accountRepository.findAllByUserId(userId);
  }

  async findById(accountId: Account['id'], userId: User['id']): Promise<Account> {
    const account = await this.accountRepository.findByAccountIdAndUserId(accountId, userId);

    if (!account) {
      throw new NotFoundException(`Account with id ${accountId} not found.`);
    }
    return account;
  }
}
