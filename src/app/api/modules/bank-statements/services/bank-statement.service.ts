import {Repository} from 'typeorm';
import {FileUpload} from 'graphql-upload';
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';
import {AccountService} from '@modules/accounts/services/account.service';
import {TransactionService} from '@modules/transactions/services/transaction.service';
import {FileParserService} from '@core/file-parser/file-parser.service';
import {TransactionMapperService} from '@core/transaction-mapper/transaction-mapper.service';
import {ReadStream} from 'fs-capacitor';

type BankStatementPartial = Pick<BankStatement, 'file' | 'account' | 'transactions'>;

@Injectable()
export class BankStatementService {
  constructor(
    @InjectRepository(BankStatement)
    private readonly bankStatementRepository: Repository<BankStatement>,
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
    await this.transactionService.create(transactions);

    return savedBankStatement;
  }

  async create(bankStatementPartial: BankStatementPartial): Promise<BankStatement> {
    return this.bankStatementRepository.save(bankStatementPartial);
  }

  private async readStream(stream: ReadStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
