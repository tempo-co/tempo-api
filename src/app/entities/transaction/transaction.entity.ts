import {IsDate, IsEnum, IsNotEmpty, IsNumber, IsString, Length, Max, Min} from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {Category} from '@core/transaction-categorizer/constants/category.enum';
import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({type: 'timestamp'})
  @IsNotEmpty()
  @IsDate()
  startedDate: Date;

  @Column({type: 'timestamp'})
  @IsNotEmpty()
  @IsDate()
  completedDate: Date;

  @Column({type: 'varchar', length: 500})
  @IsNotEmpty()
  @IsString()
  @Length(1, 500)
  description: string;

  @Column({type: 'decimal', precision: 12, scale: 2})
  @IsNotEmpty()
  @IsNumber({maxDecimalPlaces: 2})
  @Min(-999999999999.99)
  @Max(999999999999.99)
  amount: number;

  @Column({type: 'varchar', length: 3})
  @IsNotEmpty()
  @IsString()
  @Length(3, 3)
  currency: string;

  @CreateDateColumn({type: 'timestamp'})
  createdAt: Date;

  @UpdateDateColumn({type: 'timestamp'})
  updatedAt: Date;

  @Column({type: 'enum', enum: Category})
  @IsEnum(Category)
  category: Category;

  @ManyToOne(() => Account, (account) => account.transactions)
  account: Account;

  @ManyToOne(() => BankStatement, (bankStatement) => bankStatement.transactions, {nullable: true})
  bankStatement?: BankStatement | null;
}
