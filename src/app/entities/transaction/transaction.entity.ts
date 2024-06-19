import {Entity, Column, PrimaryGeneratedColumn, ManyToOne} from 'typeorm';
import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';
import {Category} from '@entities/category/category.entity';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({type: 'date'})
  startedDate: Date;

  @Column({type: 'date'})
  completedDate: Date;

  @Column({type: 'varchar', length: 255})
  description: string;

  @Column({type: 'decimal', precision: 12, scale: 2})
  amount: number;

  @Column({type: 'varchar', length: 3})
  currency: string;

  @ManyToOne(() => Account, (account) => account.transactions)
  account: Account;

  @ManyToOne(() => BankStatement, (bankStatement) => bankStatement.transactions)
  bankStatement: BankStatement;

  @ManyToOne(() => Category, (category) => category.transactions)
  category: Category;
}
