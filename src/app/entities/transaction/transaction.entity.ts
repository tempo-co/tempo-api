import { Account } from 'src/app/account/entities/account.entity';
import { Statement } from 'src/app/statement/entities/statement.entity';
import { Category } from 'src/app/category/entities/category.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  startedDate: Date;

  @Column({ type: 'date' })
  completedDate: Date;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @ManyToOne(() => Account, (account) => account.transactions)
  account: Account;

  @ManyToOne(() => Statement, (statement) => statement.transactions)
  statement: Statement;

  @ManyToOne(() => Category, (category) => category.transactions)
  category: Category;
}
