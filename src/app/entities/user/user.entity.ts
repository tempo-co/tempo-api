import {Exclude, Expose, Type} from 'class-transformer';
import {Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn} from 'typeorm';

import {Account} from '@entities/account/account.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  @Expose()
  id: string;

  @Column({type: 'varchar', length: 255})
  @Expose()
  name: string;

  @Column({type: 'varchar', length: 255, unique: true})
  @Expose()
  email: string;

  @Column({type: 'varchar', length: 255})
  @Exclude()
  password: string;

  @CreateDateColumn({type: 'timestamp'})
  @Expose()
  createdAt: Date;

  @OneToMany(() => Account, (account) => account.user)
  @Expose()
  @Type(() => Account)
  accounts: Account[];
}
