import {Exclude, Expose, Type} from 'class-transformer';
import {Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn} from 'typeorm';

import {Bank} from '@core/transaction-mapper/constants/bank.enum';
import {BankStatement} from '@modules/bank-statement/bank-statement.entity';
import {Transaction} from '@modules/transaction/transaction.entity';
import {User} from '@modules/user/user.entity';

@Entity()
export class Account {
  @PrimaryGeneratedColumn('uuid')
  @Expose()
  id: string;

  @Column({type: 'varchar', length: 255, nullable: true})
  @Expose()
  alias: string;

  @Column({type: 'decimal', precision: 12, scale: 2, default: 0})
  @Expose()
  balance: number;

  @Column({type: 'enum', enum: Bank})
  @Expose()
  bank: Bank;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  @Exclude()
  @Type(() => Transaction)
  transactions: Transaction[];

  @OneToMany(() => BankStatement, (bankStatement) => bankStatement.account)
  @Exclude()
  @Type(() => BankStatement)
  bankStatements: BankStatement[];

  @ManyToOne(() => User, (user) => user.accounts)
  @Exclude()
  @Type(() => User)
  user: User;
}
