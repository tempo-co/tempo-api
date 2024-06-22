import {Injectable, NotFoundException} from '@nestjs/common';

import {Account} from '@entities/account/account.entity';
import {AccountRepository} from '@entities/account/account.repository';
import {User} from '@entities/user/user.entity';
import {UserService} from '@modules/users/services/user.service';

type SaveOptions = {
  alias: Account['alias'];
  bank: Account['bank'];
  userId: Account['user']['id'];
};

@Injectable()
export class AccountService {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly userService: UserService,
  ) {}

  async save(options: SaveOptions): Promise<Account> {
    const {alias, bank, userId} = options;
    const user = await this.userService.findById(userId);

    return this.accountRepository.save({alias, bank, user});
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
