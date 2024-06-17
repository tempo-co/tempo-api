import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Statement} from '../../../../../entities/statement/statement.entity';
import {AccountService} from '../../accounts/services/account.service';
import {Transaction} from '../../../../../entities/transaction/transaction.entity';
import {FileParserService} from '../../../../../core/file-parser/file-parser.service';
import {TransactionMapperService} from '../../../../../core/transaction-mapper/transaction-mapper.service';
import {TransactionService} from '../../transactions/services/transaction.service';
import {FileUpload} from 'graphql-upload';
import {Account} from 'src/app/entities/account/account.entity';

type ProcessStatementOptions = {
  file: FileUpload;
  accountId: Account['id'];
};

@Injectable()
export class StatementService {
  constructor(
    @InjectRepository(Statement)
    private readonly statementRepository: Repository<Statement>,
    private readonly accountService: AccountService,
    private readonly fileParserService: FileParserService,
    private readonly transactionMapperService: TransactionMapperService,
    private readonly transactionService: TransactionService,
  ) {}

  async processStatement({accountId, file}: ProcessStatementOptions): Promise<Transaction[]> {
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
