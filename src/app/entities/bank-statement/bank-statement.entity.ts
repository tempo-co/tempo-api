import {Exclude, Expose, Type} from 'class-transformer';
import {Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn} from 'typeorm';

import {Account} from '@entities/account/account.entity';
import {File} from '@entities/file/file.entity';
import {Transaction} from '@entities/transaction/transaction.entity';

@Entity()
export class BankStatement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => File)
  @JoinColumn()
  @Expose()
  file: File;

  @OneToMany(() => Transaction, (transaction) => transaction.bankStatement)
  @Expose()
  @Type(() => Transaction)
  transactions: Transaction[];

  @ManyToOne(() => Account, (account) => account.bankStatements)
  @Exclude()
  @Type(() => Account)
  account: Account;
}
