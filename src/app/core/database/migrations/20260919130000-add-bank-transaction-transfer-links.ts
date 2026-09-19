import {MigrationInterface, QueryRunner, Table, TableUnique} from 'typeorm';

export class AddBankTransactionTransferLinks20260919130000 implements MigrationInterface {
	name = 'AddBankTransactionTransferLinks20260919130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		if (await queryRunner.hasTable('bank_transaction_transfer_links')) return;

		await queryRunner.createTable(
			new Table({
				name: 'bank_transaction_transfer_links',
				columns: [
					{name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()'},
					{name: 'legATransactionId', type: 'uuid', isNullable: false},
					{name: 'legBTransactionId', type: 'uuid', isNullable: false},
					{name: 'evidence', type: 'jsonb', isNullable: false},
					{name: 'source', type: 'varchar', length: '16', isNullable: false, default: "'MATCHER'"},
					{name: 'ruleVersion', type: 'varchar', length: '64', isNullable: false},
					{name: 'createdAt', type: 'timestamptz', isNullable: false, default: 'now()'},
					{name: 'updatedAt', type: 'timestamptz', isNullable: false, default: 'now()'},
				],
				foreignKeys: [
					{
						name: 'fk_transfer_links_leg_a',
						columnNames: ['legATransactionId'],
						referencedTableName: 'bank_transactions',
						referencedColumnNames: ['id'],
						onDelete: 'CASCADE',
					},
					{
						name: 'fk_transfer_links_leg_b',
						columnNames: ['legBTransactionId'],
						referencedTableName: 'bank_transactions',
						referencedColumnNames: ['id'],
						onDelete: 'CASCADE',
					},
				],
				uniques: [
					new TableUnique({name: 'uq_transfer_links_leg_a', columnNames: ['legATransactionId']}),
					new TableUnique({name: 'uq_transfer_links_leg_b', columnNames: ['legBTransactionId']}),
					new TableUnique({name: 'uq_transfer_links_legs', columnNames: ['legATransactionId', 'legBTransactionId']}),
				],
			}),
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		if (await queryRunner.hasTable('bank_transaction_transfer_links')) {
			await queryRunner.dropTable('bank_transaction_transfer_links');
		}
	}
}
