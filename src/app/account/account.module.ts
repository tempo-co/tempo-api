import { Module } from '@nestjs/common';
import { Account } from './entities/account.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountService } from './account.service';
import { AccountResolver } from './account.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([Account])],
  providers: [AccountService, AccountResolver],
})
export class AccountModule {}
