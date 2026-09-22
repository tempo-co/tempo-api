import {MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex} from 'typeorm';

const RULES_TABLE = 'bank_transaction_rules';
const RULES_ACCOUNT_INDEX = 'idx_bank_transaction_rules_account_active';
const RULES_NAME_INDEX = 'idx_bank_transaction_rules_account_name';
const TRANSACTION_RULE_FOREIGN_KEY = 'fk_bank_transactions_category_rule';

export class AddBankTransactionRules20260922220000 implements MigrationInterface {
	name = 'AddBankTransactionRules20260922220000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		if (!(await queryRunner.hasTable(RULES_TABLE))) {
			await queryRunner.createTable(
				new Table({
					name: RULES_TABLE,
					columns: [
						{
							name: 'id',
							type: 'uuid',
							isPrimary: true,
							isGenerated: true,
							generationStrategy: 'uuid',
							default: 'gen_random_uuid()',
						},
						{name: 'bankAccountId', type: 'uuid'},
						{name: 'name', type: 'varchar', length: '120'},
						{name: 'category', type: 'varchar', length: '32'},
						{name: 'active', type: 'boolean', default: true},
						{name: 'direction', type: 'varchar', length: '16'},
						{name: 'transactionType', type: 'varchar', length: '32'},
						{name: 'currency', type: 'varchar', length: '3'},
						{name: 'amount', type: 'numeric', precision: 20, scale: 8},
						{name: 'matchField', type: 'varchar', length: '32'},
						{name: 'matchText', type: 'varchar', length: '160'},
						{name: 'createdAt', type: 'timestamptz', default: 'now()'},
						{name: 'updatedAt', type: 'timestamptz', default: 'now()'},
					],
					foreignKeys: [
						{
							name: 'fk_bank_transaction_rules_bank_account',
							columnNames: ['bankAccountId'],
							referencedTableName: 'bank_accounts',
							referencedColumnNames: ['id'],
							onDelete: 'CASCADE',
						},
					],
				}),
				true,
			);
		}

		const rulesTable = await queryRunner.getTable(RULES_TABLE);
		if (rulesTable && !rulesTable.indices.some((index) => index.name === RULES_ACCOUNT_INDEX)) {
			await queryRunner.createIndex(
				RULES_TABLE,
				new TableIndex({name: RULES_ACCOUNT_INDEX, columnNames: ['bankAccountId', 'active']}),
			);
		}
		if (rulesTable && !rulesTable.indices.some((index) => index.name === RULES_NAME_INDEX)) {
			await queryRunner.createIndex(
				RULES_TABLE,
				new TableIndex({name: RULES_NAME_INDEX, columnNames: ['bankAccountId', 'name'], isUnique: true}),
			);
		}

		if (
			(await queryRunner.hasTable('bank_transactions')) &&
			!(await queryRunner.hasColumn('bank_transactions', 'categoryRuleId'))
		) {
			await queryRunner.addColumn(
				'bank_transactions',
				new TableColumn({name: 'categoryRuleId', type: 'uuid', isNullable: true}),
			);
			await queryRunner.createForeignKey(
				'bank_transactions',
				new TableForeignKey({
					name: TRANSACTION_RULE_FOREIGN_KEY,
					columnNames: ['categoryRuleId'],
					referencedTableName: RULES_TABLE,
					referencedColumnNames: ['id'],
					onDelete: 'SET NULL',
				}),
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		if (await queryRunner.hasTable('bank_transactions')) {
			const transactionTable = await queryRunner.getTable('bank_transactions');
			const foreignKey = transactionTable?.foreignKeys.find(
				(candidate) => candidate.name === TRANSACTION_RULE_FOREIGN_KEY,
			);
			if (foreignKey) await queryRunner.dropForeignKey('bank_transactions', foreignKey);
			if (await queryRunner.hasColumn('bank_transactions', 'categoryRuleId')) {
				await queryRunner.dropColumn('bank_transactions', 'categoryRuleId');
			}
		}
		if (await queryRunner.hasTable(RULES_TABLE)) await queryRunner.dropTable(RULES_TABLE);
	}
}
