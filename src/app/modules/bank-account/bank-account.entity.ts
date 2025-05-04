import {Exclude, Expose, Type} from 'class-transformer';
import {Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn} from 'typeorm';

import {Account} from '@modules/account/account.entity';
import {BankStatement} from '@modules/bank-statement/bank-statement.entity';
import {Bank} from '@modules/transaction/transaction-mapper/constants/bank.enum';
import {Transaction} from '@modules/transaction/transaction.entity';

@Entity('bank_accounts')
export class BankAccount {
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

	@Column({type: 'varchar', length: 3})
	@Expose()
	currency: string;

	@OneToMany(() => Transaction, (transaction) => transaction.bankAccount)
	@Exclude()
	@Type(() => Transaction)
	transactions: Transaction[];

	@OneToMany(() => BankStatement, (bankStatement) => bankStatement.bankAccount)
	@Exclude()
	@Type(() => BankStatement)
	bankStatements: BankStatement[];

	@ManyToOne(() => Account, (account) => account.bankAccounts)
	@JoinColumn({name: 'accountId'})
	@Exclude()
	@Type(() => Account)
	account: Account;
}
