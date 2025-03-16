import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {UserModule} from '../user/user.module';
import {BankAccountController} from './api/bank-account.controller';
import {BankAccount} from './bank-account.entity';
import {BankAccountService} from './bank-account.service';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount]), UserModule],
  providers: [BankAccountService],
  controllers: [BankAccountController],
  exports: [BankAccountService],
})
export class BankAccountModule {}
