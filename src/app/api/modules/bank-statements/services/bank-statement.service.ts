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

    const data = this.fileParserService.parse(buffer, mimetype);

    const createTransactionDtos = await this.transactionMapperService.map(data, account.bank);
    const transactions = await this.transactionService.create(createTransactionDtos, account);

    const options = {file: buffer, account, transactions};
    const bankStatement: BankStatement = await this.bankStatementRepository.save(options);

    return bankStatement;
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
