import {Module} from '@nestjs/common';

import {GenerativeModelProvider} from './providers/generative-model.provider';
import {TransactionCategorizerService} from './services/transaction-categorizer.service';

@Module({
	providers: [TransactionCategorizerService, GenerativeModelProvider],
	exports: [TransactionCategorizerService],
})
export class TransactionCategorizerModule {}
