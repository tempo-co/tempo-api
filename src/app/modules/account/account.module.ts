import {Module, forwardRef} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {EmailModule} from '@core/email/email.module';
import {RedisModule} from '@core/redis/redis.module';
import {AuthModule} from '@modules/auth/auth.module';
import {BankingAuthorizationStateModule} from '@modules/banking/services/banking-authorization-state.module';

import {AccountDeletionService} from './account-deletion.service';
import {Account} from './account.entity';
import {AccountService} from './account.service';
import {AccountController} from './api/account.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([Account]),
		forwardRef(() => AuthModule),
		EmailModule,
		RedisModule,
		BankingAuthorizationStateModule,
	],
	providers: [AccountService, AccountDeletionService],
	controllers: [AccountController],
	exports: [AccountService],
})
export class AccountModule {}
