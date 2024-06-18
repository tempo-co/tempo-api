import {Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany} from 'typeorm';
import {Account} from '../account/account.entity';
import {Transaction} from '../transaction/transaction.entity';

@Entity()
export class BankStatement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({type: 'date'})
  date: Date;

  @Column({type: 'varchar', length: 255})
  file: string;

  @ManyToOne(() => Account, (account) => account.bankStatements)
  account: Account;

  @OneToMany(() => Transaction, (transaction) => transaction.bankStatement)
  transactions: Transaction[];
}
