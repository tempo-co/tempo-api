import {Repository} from 'typeorm';
import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Account} from '@entities/account/account.entity';
import {UserService} from '@modules/users/services/user.service';
import {InputAccountCreate} from '../graphql/account-create.input';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly userService: UserService,
  ) {}

  async create(inputAccountCreate: InputAccountCreate, userId: string): Promise<Account> {
    const user = await this.userService.findById(userId);

    const account = this.accountRepository.create({...inputAccountCreate, user});
    return this.accountRepository.save(account);
  }

  async findAllByUserId(userId: string): Promise<Account[]> {
    return this.accountRepository.find({where: {user: {id: userId}}});
  }

  async findById(id: string): Promise<Account> {
    const account = await this.accountRepository.findOne({where: {id}});

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found.`);
    }
    return account;
  }
}
