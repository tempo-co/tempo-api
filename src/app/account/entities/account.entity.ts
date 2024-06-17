import { Bank } from 'src/app/bank-transaction-adapter/constants/bank';
import { Statement } from 'src/app/statement/entities/statement.entity';
import { Transaction } from 'src/app/transaction/entities/transaction.entity';
import { User } from 'src/app/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';

@Entity()
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  alias: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  balance: number;

  @Column({
    type: 'enum',
    enum: Bank,
  })
  bank: Bank;

  @ManyToOne(() => User, (user) => user.accounts)
  user: User;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  transactions: Transaction[];

  @OneToMany(() => Statement, (statement) => statement.account)
  statements: Statement[];
}
