import {BullModule} from '@nestjs/bullmq';
import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {BANK_TRANSACTION_CATEGORIZATION_QUEUE} from '@core/queue/queue.constants';

import {BankTransaction} from '../bank-transaction.entity';
import {BANK_TRANSACTION_CATEGORIZATION_PROVIDER_NAME} from './bank-transaction-categorization.constants';
import {BankTransactionCategorizationProcessor} from './bank-transaction-categorization.processor';
import {
	BANK_TRANSACTION_CATEGORIZATION_PROVIDER,
	BankTransactionCategorizationProvider,
} from './bank-transaction-categorization.provider';
import {BankTransactionCategorizationService} from './bank-transaction-categorization.service';
import {OpenAiBankTransactionCategorizationProvider} from './providers/openai-bank-transaction-categorization.provider';

@Module({
	imports: [
		BullModule.registerQueue({name: BANK_TRANSACTION_CATEGORIZATION_QUEUE}),
		TypeOrmModule.forFeature([BankTransaction]),
	],
	providers: [
		OpenAiBankTransactionCategorizationProvider,
		{
			provide: BANK_TRANSACTION_CATEGORIZATION_PROVIDER,
			inject: [ConfigurationService, OpenAiBankTransactionCategorizationProvider],
			useFactory: (
				configurationService: ConfigurationService,
				openAiProvider: OpenAiBankTransactionCategorizationProvider,
			): BankTransactionCategorizationProvider => {
				const provider = configurationService.get('AI_CATEGORIZATION_PROVIDER');
				if (provider === BANK_TRANSACTION_CATEGORIZATION_PROVIDER_NAME) return openAiProvider;
				throw new Error(`Unsupported AI categorization provider: ${provider}`);
			},
		},
		BankTransactionCategorizationService,
		BankTransactionCategorizationProcessor,
	],
	exports: [BankTransactionCategorizationService],
})
export class BankTransactionCategorizationModule {}
