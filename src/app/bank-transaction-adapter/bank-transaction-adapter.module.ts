import { Module } from '@nestjs/common';
import { AbnAmroTransactionAdapter } from './services/abnamro-transaction-adapter.service';
import { BankTransactionAdapterFactory } from './bank-transaction-adapter.factory';
import { RevolutTransactionAdapter } from './services/revolut-transaction-adapter.service';

@Module({
  providers: [
    AbnAmroTransactionAdapter,
    RevolutTransactionAdapter,
    BankTransactionAdapterFactory,
  ],
  exports: [BankTransactionAdapterFactory],
})
export class BankTransactionAdapterModule {}
