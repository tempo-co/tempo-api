import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';

import {BankAccount} from '../bank-account.entity';
import {BANK_TRANSACTION_CATEGORIES, type BankTransactionCategory} from '../categorization/bank-transaction-category';
import {type BankTransactionRuleDirection, BankTransactionRuleMatchField} from './bank-transaction-rule.types';

@Entity('bank_transaction_rules')
@Index('idx_bank_transaction_rules_account_active', ['bankAccountId', 'active'])
@Index('idx_bank_transaction_rules_account_name', ['bankAccountId', 'name'], {unique: true})
export class BankTransactionRule {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({type: 'uuid'})
	bankAccountId: string;

	@ManyToOne(() => BankAccount, {onDelete: 'CASCADE', nullable: false})
	@JoinColumn({name: 'bankAccountId'})
	bankAccount: BankAccount;

	@Column({type: 'varchar', length: 120})
	name: string;

	@Column({type: 'varchar', length: 32})
	category: BankTransactionCategory;

	@Column({type: 'boolean', default: true})
	active: boolean;

	@Column({type: 'varchar', length: 16})
	direction: BankTransactionRuleDirection;

	@Column({type: 'varchar', length: 32})
	transactionType: string;

	@Column({type: 'varchar', length: 3})
	currency: string;

	@Column({type: 'numeric', precision: 20, scale: 8})
	amount: string;

	@Column({type: 'varchar', length: 32})
	matchField: BankTransactionRuleMatchField;

	@Column({type: 'varchar', length: 160})
	matchText: string;

	@CreateDateColumn({type: 'timestamptz'})
	createdAt: Date;

	@UpdateDateColumn({type: 'timestamptz'})
	updatedAt: Date;
}

export const BANK_TRANSACTION_RULE_CATEGORIES = BANK_TRANSACTION_CATEGORIES;
