import {Module} from '@nestjs/common';

import {AbnAmroTransactionMapper} from './services/impl/abnamro-transaction-mapper';
import {RevolutTransactionMapper} from './services/impl/revolut-transaction-mapper';
import {TransactionMapperFactory} from './services/transaction-mapper.factory';
import {TransactionMapperService} from './services/transaction-mapper.service';

@Module({
	providers: [TransactionMapperService, TransactionMapperFactory, AbnAmroTransactionMapper, RevolutTransactionMapper],
	exports: [TransactionMapperService],
})
export class TransactionMapperModule {}
