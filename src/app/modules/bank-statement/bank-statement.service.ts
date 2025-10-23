import {InjectQueue} from '@nestjs/bullmq';
import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Job, Queue} from 'bullmq';
import {plainToInstance} from 'class-transformer';
import {Repository} from 'typeorm';

import {BANK_STATEMENT_QUEUE, PROCESS_STATEMENT_JOB} from '@core/queue/queue.constants';
import {Account} from '@modules/account/account.entity';
import {BankAccount} from '@modules/bank-account/bank-account.entity';
import {BankAccountService} from '@modules/bank-account/bank-account.service';
import {PaginationDto} from '@modules/bank-statement/api/dtos/pagination.dto';
import {FileParserService} from '@modules/file/file-parser/services/file-parser.service';
import {FileService} from '@modules/file/file.service';
import {TransactionCategorizerService} from '@modules/transaction/transaction-categorizer/services/transaction-categorizer.service';
import {TransactionCreateDto} from '@modules/transaction/transaction-mapper/services/transaction-mapper.interface';
import {TransactionMapperService} from '@modules/transaction/transaction-mapper/services/transaction-mapper.service';
import {TransactionService} from '@modules/transaction/transaction.service';

import {
	BANK_STATEMENT_DELETE_SUCCESS,
	BANK_STATEMENT_NOT_FOUND,
	BANK_STATEMENT_PERIOD_OVERLAP,
	JOB_NOT_FOUND,
} from './api/constants/api-messages.constants';
import {BankStatementJob} from './api/dtos/bank-statement-job.dto';
import {JobStatusDto} from './api/dtos/job-status.dto';
import {BankStatement} from './bank-statement.entity';

const PROGRESS_INTERVAL_MS = 2000;

@Injectable()
export class BankStatementService {
	constructor(
		@InjectRepository(BankStatement)
		private readonly bankStatementRepository: Repository<BankStatement>,
		@InjectQueue(BANK_STATEMENT_QUEUE)
		private readonly bankStatementQueue: Queue,
		private readonly bankAccountService: BankAccountService,
		private readonly fileParserService: FileParserService,
		private readonly transactionMapperService: TransactionMapperService,
		private readonly transactionCategorizerService: TransactionCategorizerService,
		private readonly transactionService: TransactionService,
		private readonly fileService: FileService,
	) {}

	async processUpload(job: Job<BankStatementJob>) {
		const {bankAccountId, accountId, file: sourceFile} = job.data;
		const file = {...sourceFile, buffer: Buffer.from(sourceFile.buffer)};
		await job.updateProgress(10);

		const bankAccount = await this.bankAccountService.findById(bankAccountId, accountId);

		const records = this.fileParserService.parse(file.buffer, file.mimetype);
		const mappedTransactions = await this.transactionMapperService.map(records, bankAccount);

		await this.assertNoPeriodOverlap(mappedTransactions, bankAccountId);
		await job.updateProgress(20);

		// simulate progress while long-running categorization api call(s) take place
		const progressInterval = setInterval(async () => {
			const currentProgress = Number(job.progress);
			if (currentProgress < 90) {
				await job.updateProgress(currentProgress + 10);
			}
		}, PROGRESS_INTERVAL_MS);

		const {categorizedTransactions} = await (async () => {
			const categorizedTransactions = await this.transactionCategorizerService.categorize(mappedTransactions);
			return {categorizedTransactions};
		})().finally(() => clearInterval(progressInterval));

		const savedFile = await this.fileService.save(file as Express.Multer.File);
		const savedBankStatement = await this.bankStatementRepository.save({file: savedFile, bankAccount});

		const transactions = categorizedTransactions.map((transaction) => ({
			...transaction,
			bankAccount: bankAccount,
			bankStatement: savedBankStatement,
		}));
		const savedTransactions = await this.transactionService.saveAll(transactions);

		await job.updateProgress(100);
		return plainToInstance(BankStatement, {...savedBankStatement, transactions: savedTransactions});
	}

	async addUploadJob(accountId: Account['id'], file: Express.Multer.File, bankAccountId: BankAccount['id']) {
		const {buffer, originalname, mimetype, size} = file;

		const bankStatementJob: BankStatementJob = {
			file: {buffer, originalname, mimetype, size},
			bankAccountId,
			accountId,
		};

		const job = await this.bankStatementQueue.add(PROCESS_STATEMENT_JOB, bankStatementJob);
		return {jobId: job.id};
	}

	async getJobStatus(jobId: string, accountId: Account['id']): Promise<JobStatusDto> {
		const job = await this.bankStatementQueue.getJob(jobId);

		if (!job || job.data.accountId !== accountId) {
			throw new NotFoundException(JOB_NOT_FOUND);
		}

		return {
			id: job.id,
			progress: job.progress,
			status: await job.getState(),
			failedReason: job.failedReason,
		};
	}

	async findAll(bankAccountId: BankAccount['id'], accountId: Account['id'], {pageIndex, pageSize}: PaginationDto) {
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

	async delete(id: BankStatement['id'], accountId: Account['id']) {
		const bankStatement = await this.bankStatementRepository.findOne({
			where: {id: id, bankAccount: {account: {id: accountId}}},
			relations: ['file', 'transactions'],
		});

		if (!bankStatement) {
			throw new NotFoundException(BANK_STATEMENT_NOT_FOUND);
		}

		if (bankStatement.transactions.length > 0) {
			const transactionIds = bankStatement.transactions.map((transaction) => transaction.id);
			await this.transactionService.deleteByIds(transactionIds);
		}

		await this.bankStatementRepository.delete(id);
		await this.fileService.deleteById(bankStatement.file.id);

		return {message: BANK_STATEMENT_DELETE_SUCCESS};
	}

	private async assertNoPeriodOverlap(transactions: TransactionCreateDto[], bankAccountId: BankAccount['id']) {
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
			throw new ConflictException(BANK_STATEMENT_PERIOD_OVERLAP);
		}
	}
}
