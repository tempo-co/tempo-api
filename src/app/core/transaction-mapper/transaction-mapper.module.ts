import {Module} from '@nestjs/common';

import {AbnAmroTransactionMapper} from './impl/abnamro-transaction-mapper';
import {RevolutTransactionMapper} from './impl/revolut-transaction-mapper';
import {TransactionMapperFactory} from './transaction-mapper.factory';
import {TransactionMapperService} from './transaction-mapper.service';

@Module({
  providers: [
    TransactionMapperService,
    AbnAmroTransactionMapper,
    RevolutTransactionMapper,
    TransactionMapperFactory,
  ],
  exports: [TransactionMapperService],
})
export class TransactionMapperModule {}
