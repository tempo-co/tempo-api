import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

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
import {BankTransactionService} from './services/bank-transaction.service';
import {BankingAuthorizationStateService} from './services/banking-authorization-state.service';
import {BankingEncryptionService} from './services/banking-encryption.service';
import {BankingSyncService} from './services/banking-sync.service';
import {EnableBankingClient} from './services/enable-banking.client';

@Module({
	imports: [
		TypeOrmModule.forFeature([BankConnection, BankAccount, BankSyncRun, BankAccountBalance, BankTransaction]),
		AccountModule,
		RedisModule,
	],
	providers: [
		BankingService,
		BankingSyncService,
		BankTransactionService,
		EnableBankingClient,
		BankingAuthorizationStateService,
		BankingEncryptionService,
	],
	controllers: [BankConnectionController, BankTransactionController],
})
export class BankingModule {}
