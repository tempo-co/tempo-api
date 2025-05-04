import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {
	PW_CHANGE_ACCOUNT_EMAIL,
	PW_CHANGE_ACCOUNT_PASSWORD,
	UNVERIFIED_ACCOUNT_EMAIL,
	UNVERIFIED_ACCOUNT_PASSWORD,
	VERIFIED_ACCOUNT_EMAIL,
	VERIFIED_ACCOUNT_PASSWORD,
} from './constants';

type AccountSeedData = Pick<Account, 'name' | 'email' | 'password' | 'isEmailVerified'>;

export async function seedDatabase(app: INestApplication) {
	const accountRepository = app.get<Repository<Account>>(getRepositoryToken(Account));

	const accountsToSeed: AccountSeedData[] = [
		{
			name: 'Verified Account',
			email: VERIFIED_ACCOUNT_EMAIL,
			password: VERIFIED_ACCOUNT_PASSWORD,
			isEmailVerified: true,
		},
		{
			name: 'Unverified Account',
			email: UNVERIFIED_ACCOUNT_EMAIL,
			password: UNVERIFIED_ACCOUNT_PASSWORD,
			isEmailVerified: false,
		},
		{
			name: 'Password Change Account',
			email: PW_CHANGE_ACCOUNT_EMAIL,
			password: PW_CHANGE_ACCOUNT_PASSWORD,
			isEmailVerified: true,
		},
	];

	const accounts = await Promise.all(
		accountsToSeed.map(async (account) => {
			const hashedPassword = await argon2.hash(account.password);
			return accountRepository.create({
				name: account.name,
				email: account.email,
				password: hashedPassword,
				isEmailVerified: account.isEmailVerified,
			});
		}),
	);
	await accountRepository.save(accounts);
}
