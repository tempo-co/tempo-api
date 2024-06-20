import {IsDate, IsNotEmpty, IsNumber, IsString, Length, Max, Min} from 'class-validator';
import {Column, Entity, ManyToOne} from 'typeorm';

import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';
import {BaseEntity} from '@entities/base.entity';

@Entity()
export class Transaction extends BaseEntity {
  constructor(init?: Partial<Transaction>) {
    super();
    Object.assign(this, init);
  }

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

  @ManyToOne(() => Account, (account) => account.transactions)
  account: Account;

  @ManyToOne(() => BankStatement, (bankStatement) => bankStatement.transactions)
  bankStatement: BankStatement;
}
