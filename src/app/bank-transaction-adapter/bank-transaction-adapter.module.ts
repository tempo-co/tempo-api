import { Module } from '@nestjs/common';
import { AbnAmroTransactionAdapter } from './impl/abnamro-transaction-adapter';
import { BankTransactionAdapterFactory } from './bank-transaction-adapter.factory';
import { RevolutTransactionAdapter } from './impl/revolut-transaction-adapter';

@Module({
  providers: [
    AbnAmroTransactionAdapter,
    RevolutTransactionAdapter,
    BankTransactionAdapterFactory,
  ],
  exports: [BankTransactionAdapterFactory],
})
export class BankTransactionAdapterModule {}
