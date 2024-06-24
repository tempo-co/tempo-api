import {GenerativeModel} from '@google/generative-ai';
import {Injectable} from '@nestjs/common';

import {TransactionPartial} from '@core/transaction-mapper/services/transaction-mapper.interface';
import {Transaction} from '@entities/transaction/transaction.entity';

type TransactionPartialWithCategory = TransactionPartial & {category: Transaction['category']};

@Injectable()
export class TransactionCategorizerService {
  constructor(private readonly model: GenerativeModel) {}

  async categorize(transactions: TransactionPartial[]): Promise<TransactionPartialWithCategory[]> {
    const strTransactions = JSON.stringify(transactions);
    const result = await this.model.generateContent(strTransactions);

    const categorizedTransactions = JSON.parse(result.response.text());
    return categorizedTransactions;
  }
}
