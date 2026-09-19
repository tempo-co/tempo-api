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

import {BankTransaction} from './bank-transaction.entity';

@Entity('bank_transaction_transfer_links')
@Index('idx_transfer_links_leg_a', ['legATransactionId'], {unique: true})
@Index('idx_transfer_links_leg_b', ['legBTransactionId'], {unique: true})
@Index('idx_transfer_links_legs', ['legATransactionId', 'legBTransactionId'], {unique: true})
export class BankTransactionTransferLink {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({type: 'uuid'})
	legATransactionId: string;

	@ManyToOne(() => BankTransaction, {onDelete: 'CASCADE', nullable: false})
	@JoinColumn({name: 'legATransactionId'})
	legATransaction: BankTransaction;

	@Column({type: 'uuid'})
	legBTransactionId: string;

	@ManyToOne(() => BankTransaction, {onDelete: 'CASCADE', nullable: false})
	@JoinColumn({name: 'legBTransactionId'})
	legBTransaction: BankTransaction;

	@Column({type: 'jsonb'})
	evidence: {
		currency: string;
		amountDelta: string;
		dateDeltaDays: number;
		matchedOn: string;
	};

	@Column({type: 'varchar', length: 16, default: 'MATCHER'})
	source: string;

	@Column({type: 'varchar', length: 64})
	ruleVersion: string;

	@CreateDateColumn({type: 'timestamptz'})
	createdAt: Date;

	@UpdateDateColumn({type: 'timestamptz'})
	updatedAt: Date;
}
