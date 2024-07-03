import {Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn} from 'typeorm';

import {Account} from '@entities/account/account.entity';

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
}
