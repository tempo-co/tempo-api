import {BullModule} from '@nestjs/bullmq';
import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {BANK_CONNECTION_SYNC_QUEUE} from '@core/queue/queue.constants';
import {RedisModule} from '@core/redis/redis.module';
import {AccountModule} from '@modules/account/account.module';

import {BankConnectionController} from './api/bank-connection.controller';
import {BankTransactionController} from './api/bank-transaction.controller';
import {BankAccountBalance} from './bank-account-balance.entity';
import {BankAccount} from './bank-account.entity';
import {BankConnection} from './bank-connection.entity';
import {BankSyncRun} from './bank-sync-run.entity';
import {BankTransaction} from './bank-transaction.entity';
import {BankingService} from './banking.service';
import {BankTransactionCategorizationModule} from './categorization/bank-transaction-categorization.module';
import {BankTransactionService} from './services/bank-transaction.service';
import {BankingAuthorizationStateModule} from './services/banking-authorization-state.module';
import {BankingConnectionLockService} from './services/banking-connection-lock.service';
import {BankingEncryptionService} from './services/banking-encryption.service';
import {BankingSyncQueueService} from './services/banking-sync-queue.service';
import {BankingSyncProcessor} from './services/banking-sync.processor';
import {BankingSyncService} from './services/banking-sync.service';
import {EnableBankingClient} from './services/enable-banking.client';

@Module({
	imports: [
		TypeOrmModule.forFeature([BankConnection, BankAccount, BankSyncRun, BankAccountBalance, BankTransaction]),
		BullModule.registerQueue({name: BANK_CONNECTION_SYNC_QUEUE}),
		AccountModule,
		RedisModule,
		BankingAuthorizationStateModule,
		BankTransactionCategorizationModule,
	],
	providers: [
		BankingService,
		BankingConnectionLockService,
		BankingSyncService,
		BankingSyncQueueService,
		BankingSyncProcessor,
		BankTransactionService,
		EnableBankingClient,
		BankingEncryptionService,
	],
	controllers: [BankConnectionController, BankTransactionController],
})
export class BankingModule {}
