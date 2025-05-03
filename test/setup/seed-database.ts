import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {Repository} from 'typeorm';

import {User} from '@modules/user/user.entity';

import {
  PW_CHANGE_USER_EMAIL,
  PW_CHANGE_USER_PASSWORD,
  UNVERIFIED_USER_EMAIL,
  UNVERIFIED_USER_PASSWORD,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from './constants';

type UserSeedData = Pick<User, 'username' | 'email' | 'password' | 'isEmailVerified'>;

export async function seedDatabase(app: INestApplication) {
  const userRepository = app.get<Repository<User>>(getRepositoryToken(User));

  const usersToSeed: UserSeedData[] = [
    {
      username: 'Verified User',
      email: VERIFIED_USER_EMAIL,
      password: VERIFIED_USER_PASSWORD,
      isEmailVerified: true,
    },
    {
      username: 'Unverified User',
      email: UNVERIFIED_USER_EMAIL,
      password: UNVERIFIED_USER_PASSWORD,
      isEmailVerified: false,
    },
    {
      username: 'Password Change User',
      email: PW_CHANGE_USER_EMAIL,
      password: PW_CHANGE_USER_PASSWORD,
      isEmailVerified: true,
    },
  ];

  const users = await Promise.all(
    usersToSeed.map(async (user) => {
      const hashedPassword = await argon2.hash(user.password);
      return userRepository.create({
        username: user.username,
        email: user.email,
        password: hashedPassword,
        isEmailVerified: user.isEmailVerified,
      });
    }),
  );
  await userRepository.save(users);
}
