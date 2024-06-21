import {Injectable} from '@nestjs/common';
import {ReadStream} from 'fs-capacitor';
import {FileUpload} from 'graphql-upload';

import {FileParserService} from '@core/file-parser/file-parser.service';
import {TransactionMapperService} from '@core/transaction-mapper/transaction-mapper.service';
import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';
import {BankStatementRepository} from '@entities/bank-statement/bank-statement.repository';
import {AccountService} from '@modules/accounts/services/account.service';
import {TransactionService} from '@modules/transactions/services/transaction.service';

@Injectable()
export class BankStatementService {
  constructor(
    private readonly bankStatementRepository: BankStatementRepository,

    private readonly accountService: AccountService,
    private readonly fileParserService: FileParserService,
    private readonly transactionMapperService: TransactionMapperService,
    private readonly transactionService: TransactionService,
  ) {}

  async process(file: FileUpload, accountId: Account['id']): Promise<BankStatement> {
    const account = await this.accountService.findById(accountId);

    const {createReadStream, mimetype} = file;
    const stream = createReadStream();
    const buffer = await this.readStream(stream);

    const jsonData = this.fileParserService.parse(buffer, mimetype);

    const mappedTransactions = await this.transactionMapperService.map(jsonData, account.bank);

    const bankStatement = this.bankStatementRepository.create({file: buffer, account});
    const savedBankStatement = await this.bankStatementRepository.save(bankStatement);

    const transactions = mappedTransactions.map((transaction) => ({
      ...transaction,
      account: account,
      bankStatement: savedBankStatement,
    }));
    await this.transactionService.saveAll(transactions);

    return savedBankStatement;
  }

  private async readStream(stream: ReadStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
