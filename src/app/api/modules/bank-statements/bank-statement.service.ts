import {Injectable} from '@nestjs/common';
import {Readable} from 'stream';

import {FileParserService} from '@core/file-parser/services/file-parser.service';
import {TransactionCategorizerService} from '@core/transaction-categorizer/services/transaction-categorizer.service';
import {TransactionMapperService} from '@core/transaction-mapper/services/transaction-mapper.service';
import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';
import {BankStatementRepository} from '@entities/bank-statement/bank-statement.repository';
import {AccountService} from '@modules/accounts/account.service';
import {TransactionService} from '@modules/transactions/transaction.service';

@Injectable()
export class BankStatementService {
  constructor(
    private readonly bankStatementRepository: BankStatementRepository,

    private readonly accountService: AccountService,
    private readonly fileParserService: FileParserService,
    private readonly transactionMapperService: TransactionMapperService,
    private readonly transactionCategorizerService: TransactionCategorizerService,
    private readonly transactionService: TransactionService,
  ) {}

  async process(file: Express.Multer.File, accountId: Account['id']): Promise<BankStatement> {
    const account = await this.accountService.findById(accountId);

    const buffer = await this.readStream(file.stream);

    const jsonData = this.fileParserService.parse(buffer, file.mimetype);

    const mappedTransactions = await this.transactionMapperService.map(jsonData, account.bank);

    const categorizedTransactions =
      await this.transactionCategorizerService.categorize(mappedTransactions);

    const savedBankStatement = await this.bankStatementRepository.save({file: buffer, account});

    const transactions = categorizedTransactions.map((transaction) => ({
      ...transaction,
      account: account,
      bankStatement: savedBankStatement,
    }));
    const savedTransactions = await this.transactionService.saveAll(transactions);

    return {...savedBankStatement, transactions: savedTransactions};
  }

  private async readStream(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
