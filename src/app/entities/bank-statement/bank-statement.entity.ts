import {Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany} from 'typeorm';
import {Account} from '@entities/account/account.entity';
import {Transaction} from '@entities/transaction/transaction.entity';

@Entity()
export class BankStatement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({type: 'bytea'})
  file: Buffer;

  @ManyToOne(() => Account, (account) => account.bankStatements)
  account: Account;

  @OneToMany(() => Transaction, (transaction) => transaction.bankStatement)
  transactions: Transaction[];
}
