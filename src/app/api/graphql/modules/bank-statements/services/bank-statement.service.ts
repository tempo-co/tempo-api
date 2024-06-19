import {Repository} from 'typeorm';
import {FileUpload} from 'graphql-upload';
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Transaction} from '@entities/transaction/transaction.entity';
import {Account} from '@entities/account/account.entity';
import {BankStatement} from '@entities/bank-statement/bank-statement.entity';
import {AccountService} from '@modules/accounts/services/account.service';
import {TransactionService} from '@modules/transactions/services/transaction.service';
import {FileParserService} from '@core/file-parser/file-parser.service';
import {TransactionMapperService} from '@core/transaction-mapper/transaction-mapper.service';

type ProcessStatementOptions = {
  file: FileUpload;
  accountId: Account['id'];
};

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

  async processBankStatement({accountId, file}: ProcessStatementOptions): Promise<Transaction[]> {
    const account = await this.accountService.findById(accountId);

    const {createReadStream, mimetype} = file;
    const stream = createReadStream();
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const data = this.fileParserService.parse(buffer, mimetype);

    const createTransactionDtos = await this.transactionMapperService.map(data, account.bank);
    const transactions = await this.transactionService.create(createTransactionDtos, account);

    // TODO: save statement in db

    return transactions;
  }
}
