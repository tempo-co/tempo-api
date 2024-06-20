import {Repository} from 'typeorm';
import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Account} from '@entities/account/account.entity';
import {UserService} from '@modules/users/services/user.service';
import {User} from '@entities/user/user.entity';

type CreateOptions = {
  accountPartial: Pick<Account, 'alias' | 'bank'>;
  userId: Account['user']['id'];
};

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly userService: UserService,
  ) {}

  async create(options: CreateOptions): Promise<Account> {
    const {accountPartial, userId} = options;
    const user = await this.userService.findById(userId);

    const account = this.accountRepository.create({...accountPartial, user});
    return this.accountRepository.save(account);
  }

  async findAllByUserId(userId: User['id']): Promise<Account[]> {
    return this.accountRepository.find({where: {user: {id: userId}}});
  }

  async findById(id: Account['id']): Promise<Account> {
    const account = await this.accountRepository.findOne({where: {id}});

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found.`);
    }
    return account;
  }
}
