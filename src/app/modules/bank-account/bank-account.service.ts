import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';

import {BankAccountCreateDto} from './api/bank-account-create.dto';
import {BankAccount} from './bank-account.entity';

@Injectable()
export class BankAccountService {
	constructor(
		@InjectRepository(BankAccount)
		private readonly bankAccountRepository: Repository<BankAccount>,
		private readonly accountService: AccountService,
	) {}

	async save(dto: BankAccountCreateDto, accountId: Account['id']): Promise<BankAccount> {
		const account = await this.accountService.findById(accountId);
		return this.bankAccountRepository.save({...dto, account});
	}

	async findAllByAccountId(accountId: Account['id']) {
		return this.bankAccountRepository.findBy({account: {id: accountId}});
	}

	async findById(id: BankAccount['id'], accountId: Account['id']) {
		const bankAccount = await this.bankAccountRepository.findOneBy({id, account: {id: accountId}});

		if (!bankAccount) {
			throw new NotFoundException(`Bank account not found.`);
		}
		return bankAccount;
	}
}
