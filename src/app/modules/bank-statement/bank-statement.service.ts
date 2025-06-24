import {ConflictException, Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {plainToInstance} from 'class-transformer';
import {Repository} from 'typeorm';

import {Account} from '@modules/account/account.entity';
import {BankAccount} from '@modules/bank-account/bank-account.entity';
import {BankAccountService} from '@modules/bank-account/bank-account.service';
import {PaginationDto} from '@modules/bank-statement/api/pagination.dto';
import {FileParserService} from '@modules/file/file-parser/services/file-parser.service';
import {FileService} from '@modules/file/file.service';
import {TransactionCategorizerService} from '@modules/transaction/transaction-categorizer/services/transaction-categorizer.service';
import {TransactionPartial} from '@modules/transaction/transaction-mapper/services/transaction-mapper.interface';
import {TransactionMapperService} from '@modules/transaction/transaction-mapper/services/transaction-mapper.service';
import {TransactionService} from '@modules/transaction/transaction.service';

import {BankStatement} from './bank-statement.entity';

@Injectable()
export class BankStatementService {
	constructor(
		@InjectRepository(BankStatement)
		private readonly bankStatementRepository: Repository<BankStatement>,
		private readonly bankAccountService: BankAccountService,
		private readonly fileParserService: FileParserService,
		private readonly transactionMapperService: TransactionMapperService,
		private readonly transactionCategorizerService: TransactionCategorizerService,
		private readonly transactionService: TransactionService,
		private readonly fileService: FileService,
	) {}

	async save(file: Express.Multer.File, bankAccountId: BankAccount['id'], accountId: Account['id']) {
		const bankAccount = await this.bankAccountService.findById(bankAccountId, accountId);

		const records = this.fileParserService.parse(file.buffer, file.mimetype);
		const mappedTransactions = await this.transactionMapperService.map(records, bankAccount.bank);

		await this.assertNoPeriodOverlap(mappedTransactions, bankAccountId);

		const categorizedTransactions = await this.transactionCategorizerService.categorize(mappedTransactions);

		const savedFile = await this.fileService.save(file);
		const savedBankStatement = await this.bankStatementRepository.save({file: savedFile, bankAccount});

		const transactions = categorizedTransactions.map((transaction) => ({
			...transaction,
			bankAccount: bankAccount,
			bankStatement: savedBankStatement,
		}));
		const savedTransactions = await this.transactionService.saveAll(transactions);

		return plainToInstance(BankStatement, {...savedBankStatement, transactions: savedTransactions});
	}

	async findAllByBankAccountIdAndAccountId(
		bankAccountId: BankAccount['id'],
		accountId: Account['id'],
		{pageIndex, pageSize}: PaginationDto,
	): Promise<{
		bankStatements: BankStatement[];
		total: number;
	}> {
		const [bankStatements, total] = await this.bankStatementRepository
			.createQueryBuilder('bankStatement')
			.innerJoin('bankStatement.bankAccount', 'bankAccount')
			.innerJoin('bankAccount.account', 'account')
			.where('account.id = :accountId', {accountId})
			.andWhere('bankAccount.id = :bankAccountId', {bankAccountId})
			.leftJoinAndSelect('bankStatement.file', 'file')
			.leftJoinAndSelect('bankStatement.transactions', 'transactions')
			.skip(pageIndex * pageSize)
			.take(pageSize)
			.getManyAndCount();

		return {bankStatements, total};
	}

	async deleteByIdAndAccountId(id: BankStatement['id'], accountId: Account['id']) {
		const bankStatement = await this.bankStatementRepository.findOne({
			where: {id: id, bankAccount: {account: {id: accountId}}},
			relations: ['file', 'transactions'],
		});

		if (!bankStatement) {
			return;
		}

		if (bankStatement.transactions.length > 0) {
			const transactionIds = bankStatement.transactions.map((transaction) => transaction.id);
			await this.transactionService.deleteByIds(transactionIds);
		}

		await this.bankStatementRepository.delete(id);
		await this.fileService.deleteById(bankStatement.file.id);
	}

	private async assertNoPeriodOverlap(transactions: TransactionPartial[], bankAccountId: BankAccount['id']) {
		let periodStart = transactions[0].startedAt;
		let periodEnd = transactions[0].startedAt;

		transactions.forEach((transaction) => {
			if (transaction.startedAt < periodStart) {
				periodStart = transaction.startedAt;
			}
			if (transaction.startedAt > periodEnd) {
				periodEnd = transaction.startedAt;
			}
		});

		const existingStatements = await this.bankStatementRepository.find({
			where: {bankAccount: {id: bankAccountId}},
			relations: ['transactions'],
		});

		const overlappingStatement = existingStatements.find((statement) => {
			const statementPeriodStart = statement.transactions.reduce(
				(minDate, transaction) => (transaction.startedAt < minDate ? transaction.startedAt : minDate),
				statement.transactions[0]?.startedAt,
			);

			const statementPeriodEnd = statement.transactions.reduce(
				(maxDate, transaction) => (transaction.startedAt > maxDate ? transaction.startedAt : maxDate),
				statement.transactions[0]?.startedAt,
			);

			return (
				(periodStart >= statementPeriodStart && periodStart <= statementPeriodEnd) || // Overlapping start
				(periodEnd >= statementPeriodStart && periodEnd <= statementPeriodEnd) || // Overlapping end
				(statementPeriodStart >= periodStart && statementPeriodEnd <= periodEnd) // Existing period is fully inside new period
			);
		});

		if (overlappingStatement) {
			throw new ConflictException(`A bank statement already exists for this period.`);
		}
	}
}
