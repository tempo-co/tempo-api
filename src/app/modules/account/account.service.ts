import {ConflictException, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {Repository} from 'typeorm';

import {EMAIL_ALREADY_IN_USE} from '@modules/auth/api/constants/api-messages.constants';

import {Account} from './account.entity';

@Injectable()
export class AccountService {
	constructor(
		@InjectRepository(Account)
		private readonly accountRepository: Repository<Account>,
	) {}

	async findById(id: Account['id']) {
		const account = await this.accountRepository.findOneBy({id});

		if (!account) {
			throw new NotFoundException(`Account not found.`);
		}
		return account;
	}

	/** Serializes pending email changes and confirmation against the same account row. */
	async withLockedAccount<T>(
		id: Account['id'],
		action: (account: Account, repository: Repository<Account>) => Promise<T>,
	): Promise<T> {
		return this.accountRepository.manager.transaction(async (manager) => {
			const repository = manager.getRepository(Account);
			const account = await repository.findOne({where: {id}, lock: {mode: 'pessimistic_write'}});
			if (!account) throw new NotFoundException('Account not found.');
			return action(account, repository);
		});
	}

	async findByEmail(email: Account['email']) {
		return await this.accountRepository.findOneBy({email});
	}

	async validateEmailIsUnique(email: Account['email']) {
		const emailExists = await this.accountRepository.existsBy({email});

		if (emailExists) {
			throw new ConflictException(EMAIL_ALREADY_IN_USE);
		}
	}

	hashPassword(password: string): Promise<Account['password']> {
		return argon2.hash(password);
	}

	async verifyPassword(hash: Account['password'], password: Account['password']) {
		const isPasswordValid = await argon2.verify(hash, password);
		if (!isPasswordValid) {
			throw new UnauthorizedException();
		}
	}

	async save(name: Account['name'], email: Account['email'], password: Account['password']) {
		return this.accountRepository.save(this.accountRepository.create({name, email, password}));
	}

	async update(id: Account['id'], updates: Partial<Account>) {
		await this.updateFields(id, updates);
		return this.findById(id);
	}

	/** Like `update`, for callers that don't need the updated account back. */
	async updateFields(id: Account['id'], updates: Partial<Account>): Promise<void> {
		await this.accountRepository.update({id}, updates);
	}
}
