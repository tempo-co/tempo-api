import {ConflictException, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {Repository} from 'typeorm';

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

	async findByEmail(email: Account['email']) {
		return await this.accountRepository.findOneBy({email});
	}

	async validateEmailIsUnique(email: Account['email']) {
		const emailExists = await this.accountRepository.existsBy({email});

		if (emailExists) {
			throw new ConflictException(`This email is already in use.`);
		}
	}

	async verifyPassword(hash: Account['password'], password: Account['password']) {
		const isPasswordValid = await argon2.verify(hash, password);
		if (!isPasswordValid) {
			throw new UnauthorizedException();
		}
	}

	async save(name: Account['name'], email: Account['email'], password: Account['password']) {
		return this.accountRepository.save({name, email, password});
	}

	async update(id: Account['id'], updates: Partial<Account>) {
		await this.accountRepository.update({id}, updates);
		return this.findById(id);
	}
}
