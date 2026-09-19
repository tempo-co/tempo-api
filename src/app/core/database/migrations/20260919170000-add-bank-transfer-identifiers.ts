import {MigrationInterface, QueryRunner, TableColumn} from 'typeorm';

const ACCOUNT_IDENTIFIER_COLUMN = new TableColumn({
	name: 'accountIdentifier',
	type: 'jsonb',
	isNullable: true,
});

const COUNTERPARTY_ACCOUNT_IDENTIFIER_COLUMN = new TableColumn({
	name: 'counterpartyAccountIdentifier',
	type: 'jsonb',
	isNullable: true,
});

export class AddBankTransferIdentifiers20260919170000 implements MigrationInterface {
	name = 'AddBankTransferIdentifiers20260919170000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		if (await queryRunner.hasTable('bank_accounts')) {
			if (!(await queryRunner.hasColumn('bank_accounts', ACCOUNT_IDENTIFIER_COLUMN.name))) {
				await queryRunner.addColumn('bank_accounts', ACCOUNT_IDENTIFIER_COLUMN);
			}
		}

		if (await queryRunner.hasTable('bank_transactions')) {
			if (!(await queryRunner.hasColumn('bank_transactions', COUNTERPARTY_ACCOUNT_IDENTIFIER_COLUMN.name))) {
				await queryRunner.addColumn('bank_transactions', COUNTERPARTY_ACCOUNT_IDENTIFIER_COLUMN);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		if (await queryRunner.hasTable('bank_transactions')) {
			if (await queryRunner.hasColumn('bank_transactions', COUNTERPARTY_ACCOUNT_IDENTIFIER_COLUMN.name)) {
				await queryRunner.dropColumn('bank_transactions', COUNTERPARTY_ACCOUNT_IDENTIFIER_COLUMN.name);
			}
		}

		if (await queryRunner.hasTable('bank_accounts')) {
			if (await queryRunner.hasColumn('bank_accounts', ACCOUNT_IDENTIFIER_COLUMN.name)) {
				await queryRunner.dropColumn('bank_accounts', ACCOUNT_IDENTIFIER_COLUMN.name);
			}
		}
	}
}
