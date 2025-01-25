import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';

import {GenerativeModelProvider} from './providers/generative-model.provider';
import {TransactionCategorizerService} from './services/transaction-categorizer.service';

@Module({
  imports: [ConfigModule],
  providers: [TransactionCategorizerService, GenerativeModelProvider],
  exports: [TransactionCategorizerService],
})
export class TransactionCategorizerModule {}
