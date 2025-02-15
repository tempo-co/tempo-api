import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {plainToInstance} from 'class-transformer';
import {Repository} from 'typeorm';

import {FileParserService} from '@core/file-parser/services/file-parser.service';
import {TransactionCategorizerService} from '@core/transaction-categorizer/services/transaction-categorizer.service';
import {TransactionMapperService} from '@core/transaction-mapper/services/transaction-mapper.service';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';
import {FileService} from '@modules/file/file.service';
import {PaginationDto} from '@modules/transaction/api/pagination.dto';
import {TransactionService} from '@modules/transaction/transaction.service';
import {User} from '@modules/user/user.entity';

import {BankStatement} from './bank-statement.entity';

type SaveOptions = {
  file: Express.Multer.File;
  accountId: Account['id'];
  userId: User['id'];
};

@Injectable()
export class BankStatementService {
  constructor(
    @InjectRepository(BankStatement)
    private readonly bankStatementRepository: Repository<BankStatement>,
    private readonly accountService: AccountService,
    private readonly fileParserService: FileParserService,
    private readonly transactionMapperService: TransactionMapperService,
    private readonly transactionCategorizerService: TransactionCategorizerService,
    private readonly transactionService: TransactionService,
    private readonly fileService: FileService,
  ) {}

  async save(options: SaveOptions) {
    const {file, accountId, userId} = options;

    const account = await this.accountService.findById(accountId, userId);

    const records = this.fileParserService.parse(file.buffer, file.mimetype);
    const mappedTransactions = await this.transactionMapperService.map(records, account.bank);

    const categorizedTransactions =
      await this.transactionCategorizerService.categorize(mappedTransactions);

    const savedFile = await this.fileService.save(file);
    const savedBankStatement = await this.bankStatementRepository.save({file: savedFile, account});

    const transactions = categorizedTransactions.map((transaction) => ({
      ...transaction,
      account: account,
      bankStatement: savedBankStatement,
    }));
    const savedTransactions = await this.transactionService.saveAll(transactions);

    return plainToInstance(BankStatement, {...savedBankStatement, transactions: savedTransactions});
  }

  async findAllByAccountIdAndUserId(
    accountId: Account['id'],
    userId: User['id'],
    {pageIndex, pageSize}: PaginationDto,
  ): Promise<{
    bankStatements: BankStatement[];
    total: number;
  }> {
    const [bankStatements, total] = await this.bankStatementRepository
      .createQueryBuilder('bankStatement')
      .innerJoin('bankStatement.account', 'account')
      .innerJoin('account.user', 'user')
      .where('user.id = :userId', {userId})
      .andWhere('account.id = :accountId', {accountId})
      .leftJoinAndSelect('bankStatement.file', 'file')
      .leftJoinAndSelect('bankStatement.transactions', 'transactions')
      .skip(pageIndex * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {bankStatements, total};
  }

  async findFileByIdAndUserId(id: BankStatement['id'], userId: User['id']) {
    const bankStatement = await this.bankStatementRepository.findOne({
      where: {id: id, account: {user: {id: userId}}},
      relations: ['file', 'transactions'],
    });

    if (!bankStatement) {
      throw new NotFoundException(`Bank statement with id ${id} not found.`);
    }
    return this.fileService.findById(bankStatement.file.id);
  }

  async deleteByIdAndUserId(id: BankStatement['id'], userId: User['id']) {
    const bankStatement = await this.bankStatementRepository.findOne({
      where: {id: id, account: {user: {id: userId}}},
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
}
