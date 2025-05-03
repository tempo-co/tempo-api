import {Exclude, Expose, Type} from 'class-transformer';
import {Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn} from 'typeorm';

import {BankAccount} from '@modules/bank-account/bank-account.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  @Expose()
  id: string;

  @Column({type: 'varchar', length: 255})
  @Expose()
  username: string;

  @Index()
  @Column({type: 'varchar', length: 255, unique: true})
  @Expose()
  email: string;

  @Column({type: 'boolean', default: false})
  @Expose()
  isEmailVerified: boolean;

  @Column({type: 'varchar', length: 255})
  @Exclude()
  password: string;

  @CreateDateColumn({type: 'timestamp'})
  @Expose()
  createdAt: Date;

  @OneToMany(() => BankAccount, (bankAccount) => bankAccount.user)
  @Expose()
  @Type(() => BankAccount)
  bankAccounts: BankAccount[];
}
