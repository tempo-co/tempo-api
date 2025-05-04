import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {AccountModule} from '@modules/account/account.module';

import {BankAccountController} from './api/bank-account.controller';
import {BankAccount} from './bank-account.entity';
import {BankAccountService} from './bank-account.service';

@Module({
	imports: [TypeOrmModule.forFeature([BankAccount]), AccountModule],
	providers: [BankAccountService],
	controllers: [BankAccountController],
	exports: [BankAccountService],
})
export class BankAccountModule {}
