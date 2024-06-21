import {Injectable, NotFoundException} from '@nestjs/common';

import {Account} from '@entities/account/account.entity';
import {AccountRepository} from '@entities/account/account.repository';
import {User} from '@entities/user/user.entity';
import {UserService} from '@modules/users/services/user.service';

type SaveAccountOptions = {
  accountPartial: Pick<Account, 'alias' | 'bank'>;
  userId: Account['user']['id'];
};

@Injectable()
export class AccountService {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly userService: UserService,
  ) {}

  async save(options: SaveAccountOptions): Promise<Account> {
    const {accountPartial, userId} = options;
    const user = await this.userService.findById(userId);

    const account = this.accountRepository.create({...accountPartial, user});
    return this.accountRepository.save(account);
  }

  async findAllByUserId(userId: User['id']): Promise<Account[]> {
    return this.accountRepository.findAllByUserId(userId);
  }

  async findById(id: Account['id']): Promise<Account> {
    const account = await this.accountRepository.findById(id);

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found.`);
    }
    return account;
  }
}
