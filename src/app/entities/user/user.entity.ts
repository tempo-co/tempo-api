import {Column, Entity, OneToMany} from 'typeorm';

import {Account} from '@entities/account/account.entity';
import {BaseEntity} from '@entities/base.entity';

@Entity()
export class User extends BaseEntity {
  @Column({type: 'varchar', length: 255})
  name: string;

  @Column({type: 'varchar', length: 255, unique: true})
  email: string;

  @Column({type: 'varchar', length: 255})
  password: string;

  @OneToMany(() => Account, (account) => account.user)
  accounts: Account[];
}
