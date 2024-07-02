import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {Account} from '@entities/account/account.entity';
import {RefreshToken} from '@entities/refresh-token/refresh-token.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({type: 'varchar', length: 255})
  name: string;

  @Column({type: 'varchar', length: 255, unique: true})
  email: string;

  @Column({type: 'varchar', length: 255})
  password: string;

  @CreateDateColumn({type: 'timestamp'})
  createdAt: Date;

  @OneToMany(() => Account, (account) => account.user)
  accounts: Account[];

  @OneToOne(() => RefreshToken, (refreshToken) => refreshToken.user)
  refreshToken: RefreshToken;
}
