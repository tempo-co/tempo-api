import { Module } from '@nestjs/common';
import { AbnAmroTransactionAdapter } from './service/abnamro-transaction-adapter.service';
import { BankTransactionAdapterFactory } from './bank-transaction-adapter.factory';

@Module({
  providers: [AbnAmroTransactionAdapter, BankTransactionAdapterFactory],
  exports: [BankTransactionAdapterFactory],
})
export class TransactionAdapterModule {}
