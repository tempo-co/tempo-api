import {MigrationInterface, QueryRunner, TableColumn} from 'typeorm';

const COLUMN = new TableColumn({
	name: 'counterpartyAccount',
	type: 'varchar',
	length: '255',
	isNullable: true,
});

export class AddBankTransactionCounterpartyAccount20260919120000 implements MigrationInterface {
	name = 'AddBankTransactionCounterpartyAccount20260919120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		if (!(await queryRunner.hasTable('bank_transactions'))) return;
		if (!(await queryRunner.hasColumn('bank_transactions', COLUMN.name))) {
			await queryRunner.addColumn('bank_transactions', COLUMN);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		if (!(await queryRunner.hasTable('bank_transactions'))) return;
		if (await queryRunner.hasColumn('bank_transactions', COLUMN.name)) {
			await queryRunner.dropColumn('bank_transactions', COLUMN.name);
		}
	}
}
