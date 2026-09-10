import {BankTransactionType} from '../../bank-transaction-type';

export enum BankTransactionDirection {
	INCOME = 'INCOME',
	EXPENSE = 'EXPENSE',
	UNKNOWN = 'UNKNOWN',
}

export class BankTransactionResponseDto {
	id: string;
	transactionDate: string | null;
	bookingDate: string | null;
	valueDate: string | null;
	description: string | null;
	displayDescription: string;
	counterpartyName: string | null;
	amount: string;
	currency: string;
	creditDebitIndicator: string | null;
	direction: BankTransactionDirection;
	transactionType: BankTransactionType;
	transactionStatus: string | null;
	providerTransactionDescription: string | null;
	merchantCategoryCode: string | null;
	remittanceInformation: string | null;
	balanceAfterAmount: string | null;
	balanceAfterCurrency: string | null;
	instructedAmount: string | null;
	instructedCurrency: string | null;
	exchangeRate: string | null;
	exchangeRateUnitCurrency: string | null;
	exchangeRateType: string | null;
	referenceNumber: string | null;
	referenceNumberScheme: string | null;
	bankName: string;
	bankCountry: string;
	bankAccountName: string | null;
	bankAccountAlias: string | null;
}

export class BankTransactionsResponseDto {
	transactions: BankTransactionResponseDto[];
	total: number;
}
