import { Module } from '@nestjs/common';
import { AbnAmroTransactionAdapter } from './impl/abnamro-transaction-adapter';
import { BankTransactionAdapterFactory } from './bank-transaction-adapter.factory';
import { RevolutTransactionAdapter } from './impl/revolut-transaction-adapter';
import { BankTransactionAdapterService } from './bank-transaction-adapter.service';

@Module({
  providers: [
    BankTransactionAdapterService,
    AbnAmroTransactionAdapter,
    RevolutTransactionAdapter,
    BankTransactionAdapterFactory,
  ],
  exports: [BankTransactionAdapterService],
})
export class BankTransactionAdapterModule {}
