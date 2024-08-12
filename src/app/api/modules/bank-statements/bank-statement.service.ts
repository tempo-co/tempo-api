import {Injectable, NotFoundException} from '@nestjs/common';
import {plainToInstance} from 'class-transformer';

import {FileParserService} from '@core/file-parser/services/file-parser.service';
import {TransactionCategorizerService} from '@core/transaction-categorizer/services/transaction-categorizer.service';
import {TransactionMapperService} from '@core/transaction-mapper/services/transaction-mapper.service';
import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';
import {BankStatementRepository} from '@entities/bank-statement/bank-statement.repository';
import {User} from '@entities/user/user.entity';
import {AccountService} from '@modules/accounts/account.service';
import {FileService} from '@modules/files/file.service';
import {TransactionService} from '@modules/transactions/transaction.service';

type SaveOptions = {
  file: Express.Multer.File;
  accountId: Account['id'];
  userId: User['id'];
};

@Injectable()
export class BankStatementService {
  constructor(
    private readonly bankStatementRepository: BankStatementRepository,

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

  async findAllByAccountIdAndUserId(accountId: Account['id'], userId: User['id']) {
    return this.bankStatementRepository.findAllByAccountIdAndUserId(accountId, userId);
  }

  async findFileByIdAndUserId(id: BankStatement['id'], userId: User['id']) {
    const bankStatement = await this.bankStatementRepository.findByIdAndUserId(id, userId);

    if (!bankStatement) {
      throw new NotFoundException(`Bank statement with id ${id} not found.`);
    }
    return this.fileService.findById(bankStatement.file.id);
  }

  async deleteByIdAndUserId(id: BankStatement['id'], userId: User['id']) {
    const bankStatement = await this.bankStatementRepository.findByIdAndUserId(id, userId);

    if (!bankStatement) {
      return;
    }

    if (bankStatement.transactions.length > 0) {
      const transactionIds = bankStatement.transactions.map((transaction) => transaction.id);
      await this.transactionService.deleteByIds(transactionIds);
    }

    await this.bankStatementRepository.deleteById(id);
    await this.fileService.deleteById(bankStatement.file.id);
  }
}
