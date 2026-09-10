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
import {BankTransactionType} from './bank-transaction-type';

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

	@Column({type: 'varchar', length: 16, nullable: true})
	merchantCategoryCode: string | null;

	@Column({type: 'text', nullable: true})
	remittanceInformation: string | null;

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
