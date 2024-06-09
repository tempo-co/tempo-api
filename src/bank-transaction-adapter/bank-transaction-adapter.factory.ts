import { Injectable } from '@nestjs/common';
import { AbnAmroTransactionAdapter } from './service/abnamro-transaction-adapter.service';
import { RevolutTransactionAdapter } from './service/revolut-transaction-adapter.service';
import { BankTransactionAdapter } from './bank-transaction-adapter.interface';
import { Bank } from './constants/bank';

@Injectable()
export class BankTransactionAdapterFactory {
  constructor(
    private readonly abnAmroTransactionMapper: AbnAmroTransactionAdapter,
    private readonly revolutTransactionMapper: RevolutTransactionAdapter,
  ) {}

  create(bank: Bank): BankTransactionAdapter {
    switch (bank) {
      case Bank.ABN_AMRO:
        return this.abnAmroTransactionMapper;
      case Bank.REVOLUT:
        return this.revolutTransactionMapper;
      default:
        throw new Error(`Unsupported bank: ${bank}`);
    }
  }
}
