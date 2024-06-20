import {Column, Entity, ManyToOne, OneToMany} from 'typeorm';

import {Account} from '@entities/account/account.entity';
import {BaseEntity} from '@entities/base.entity';
import {Transaction} from '@entities/transaction/transaction.entity';

@Entity()
export class BankStatement extends BaseEntity {
  @Column({type: 'bytea'})
  file: Buffer;

  @ManyToOne(() => Account, (account) => account.bankStatements)
  account: Account;

  @OneToMany(() => Transaction, (transaction) => transaction.bankStatement)
  transactions: Transaction[];
}
