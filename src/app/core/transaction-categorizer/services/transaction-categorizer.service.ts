import {GenerativeModel} from '@google/generative-ai';
import {Injectable} from '@nestjs/common';

import {TransactionPartial} from '@core/transaction-mapper/services/transaction-mapper.interface';
import {Transaction} from '@modules/transaction/transaction.entity';

import {Category} from '../constants/category.enum';

type CategorizedTransactionPartial = TransactionPartial & {category: Transaction['category']};

@Injectable()
export class TransactionCategorizerService {
  constructor(private readonly model: GenerativeModel) {}

  async categorize(transactions: TransactionPartial[]): Promise<CategorizedTransactionPartial[]> {
    try {
      const serializedTransactions = JSON.stringify(
        transactions.map(({description, amount, currency}) => ({description, amount, currency})),
      );
      const result = await this.model.generateContent(serializedTransactions);
      const categories: string[] = JSON.parse(result.response.text());

      return transactions.map((transaction, index) => ({
        ...transaction,
        category: this.mapCategory(categories[index]),
      }));
    } catch (error) {
      return transactions.map((transaction) => ({
        ...transaction,
        category: Category.OTHER,
      }));
    }
  }

  private mapCategory(category: string): Category {
    return Object.values(Category).includes(category as Category)
      ? (category as Category)
      : Category.OTHER;
  }
}
