import { Module } from '@nestjs/common';
import { AbnAmroTransactionAdapter } from './service/abnamro-transaction-adapter.service';
import { BankTransactionAdapterFactory } from './bank-transaction-adapter.factory';
import { RevolutTransactionAdapter } from './service/revolut-transaction-adapter.service';

@Module({
  providers: [
    AbnAmroTransactionAdapter,
    RevolutTransactionAdapter,
    BankTransactionAdapterFactory,
  ],
  exports: [BankTransactionAdapterFactory],
})
export class TransactionAdapterModule {}
