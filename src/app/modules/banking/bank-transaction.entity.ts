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

import {BankAccount} from './bank-account.entity';
import type {
	BankTransactionFinancialEventSource,
	BankTransactionFinancialEventType,
} from './bank-transaction-financial-event';
import type {BankTransactionLocation} from './bank-transaction-location';
import {BankTransactionType} from './bank-transaction-type';
import type {BankTransactionCategorizationSearchTrace} from './categorization/bank-transaction-categorization.types';
import {BankTransactionRule} from './rules/bank-transaction-rule.entity';

@Entity('bank_transactions')
@Index('idx_bank_transactions_account_dedupe', ['bankAccountId', 'dedupeKey'], {unique: true})
@Index('idx_bank_transactions_account_booking_date', ['bankAccountId', 'bookingDate'])
export class BankTransaction {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({type: 'uuid'})
	bankAccountId: string;

	@ManyToOne(() => BankAccount, {onDelete: 'CASCADE', nullable: false})
	@JoinColumn({name: 'bankAccountId'})
	bankAccount: BankAccount;

	@Column({type: 'varchar', length: 255, nullable: true})
	providerTransactionId: string | null;

	@Column({type: 'varchar', length: 255, nullable: true})
	entryReference: string | null;

	@Column({type: 'varchar', length: 64})
	dedupeKey: string;

	@Column({type: 'date', nullable: true})
	bookingDate: string | null;

	@Column({type: 'date', nullable: true})
	valueDate: string | null;

	@Column({type: 'date', nullable: true})
	transactionDate: string | null;

	@Column({type: 'numeric', precision: 20, scale: 8})
	amount: string;

	@Column({type: 'numeric', precision: 30, scale: 12, nullable: true})
	amountInBaseCurrency: string | null;

	@Column({type: 'varchar', length: 3})
	currency: string;

	@Column({type: 'varchar', length: 8, nullable: true})
	creditDebitIndicator: string | null;

	@Column({type: 'varchar', length: 32, nullable: true})
	transactionType: BankTransactionType | null;

	@Column({type: 'varchar', length: 32, nullable: true})
	transactionStatus: string | null;

	@Column({type: 'varchar', length: 64, nullable: true})
	bankTransactionCode: string | null;

	@Column({type: 'varchar', length: 64, nullable: true})
	bankTransactionSubCode: string | null;

	@Column({type: 'varchar', length: 255, nullable: true})
	bankTransactionDescription: string | null;

	@Column({type: 'varchar', length: 500, nullable: true})
	description: string | null;

	@Column({type: 'varchar', length: 500})
	displayDescription: string;

	@Column({type: 'varchar', length: 255, nullable: true})
	counterpartyName: string | null;

	@Column({type: 'jsonb', nullable: true})
	merchantLocation: BankTransactionLocation | null;

	@Column({type: 'varchar', length: 16, nullable: true})
	merchantCategoryCode: string | null;

	@Column({type: 'text', nullable: true})
	remittanceInformation: string | null;

	@Column({type: 'varchar', length: 32, nullable: true})
	category: string | null;

	@Column({type: 'varchar', length: 16, default: 'PENDING'})
	categoryStatus: string;

	@Column({type: 'varchar', length: 16, nullable: true})
	categorySource: string | null;

	@Column({type: 'uuid', nullable: true})
	categoryRuleId: string | null;

	@ManyToOne(() => BankTransactionRule, {onDelete: 'SET NULL', nullable: true})
	@JoinColumn({name: 'categoryRuleId'})
	categoryRule: BankTransactionRule | null;

	@Column({type: 'numeric', precision: 4, scale: 3, nullable: true})
	categoryConfidence: string | null;

	@Column({type: 'varchar', length: 64, nullable: true})
	categoryInputHash: string | null;

	@Column({type: 'varchar', length: 64, nullable: true})
	categoryAppliedInputHash: string | null;

	@Column({type: 'varchar', length: 32, nullable: true})
	categoryProvider: string | null;

	@Column({type: 'varchar', length: 128, nullable: true})
	categoryModel: string | null;

	@Column({type: 'varchar', length: 64, nullable: true})
	categoryPromptVersion: string | null;

	@Column({type: 'timestamptz', nullable: true})
	categoryUpdatedAt: Date | null;

	@Column({type: 'text', nullable: true})
	categoryLastError: string | null;

	@Column({type: 'jsonb', nullable: true})
	categorySearchTrace: BankTransactionCategorizationSearchTrace | null;

	@Column({type: 'varchar', length: 32, nullable: true})
	financialEventType: BankTransactionFinancialEventType | null;

	@Column({type: 'varchar', length: 16, nullable: true})
	financialEventSource: BankTransactionFinancialEventSource | null;

	@Column({type: 'varchar', length: 64, nullable: true})
	financialEventRuleVersion: string | null;

	@Column({type: 'numeric', precision: 20, scale: 8, nullable: true})
	balanceAfterAmount: string | null;

	@Column({type: 'varchar', length: 3, nullable: true})
	balanceAfterCurrency: string | null;

	@Column({type: 'numeric', precision: 20, scale: 8, nullable: true})
	instructedAmount: string | null;

	@Column({type: 'varchar', length: 3, nullable: true})
	instructedCurrency: string | null;

	@Column({type: 'numeric', precision: 30, scale: 18, nullable: true})
	exchangeRate: string | null;

	@Column({type: 'varchar', length: 3, nullable: true})
	exchangeRateUnitCurrency: string | null;

	@Column({type: 'varchar', length: 16, nullable: true})
	exchangeRateType: string | null;

	@Column({type: 'varchar', length: 255, nullable: true})
	referenceNumber: string | null;

	@Column({type: 'varchar', length: 32, nullable: true})
	referenceNumberScheme: string | null;

	@CreateDateColumn({type: 'timestamptz'})
	createdAt: Date;

	@UpdateDateColumn({type: 'timestamptz'})
	updatedAt: Date;
}
