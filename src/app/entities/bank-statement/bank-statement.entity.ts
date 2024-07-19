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
  file: File;

  @OneToMany(() => Transaction, (transaction) => transaction.bankStatement)
  transactions: Transaction[];

  @ManyToOne(() => Account, (account) => account.bankStatements)
  account: Account;
}
