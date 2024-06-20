import {Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany} from 'typeorm';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';
import {Transaction} from '@entities/transaction/transaction.entity';
import {User} from '@entities/user/user.entity';
import {Bank} from '@core/transaction-mapper/constants/bank.enum';

@Entity()
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({type: 'varchar', length: 255})
  alias: string;

  @Column({type: 'decimal', precision: 12, scale: 2})
  balance: number;

  @Column({type: 'enum', enum: Bank})
  bank: Bank;

  @ManyToOne(() => User, (user) => user.accounts)
  user: User;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  transactions: Transaction[];

  @OneToMany(() => BankStatement, (bankStatement) => bankStatement.account)
  bankStatements: BankStatement[];
}
