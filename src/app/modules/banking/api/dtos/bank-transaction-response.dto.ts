import type {BankTransactionDirection} from '../../bank-transaction-direction';
import type {
	BankTransactionCashFlowTreatment,
	BankTransactionFinancialEventSource,
	BankTransactionFinancialEventType,
} from '../../bank-transaction-financial-event';
import type {BankTransactionType} from '../../bank-transaction-type';
import type {
	BankTransactionCategorizationSource,
	BankTransactionCategorizationStatus,
} from '../../categorization/bank-transaction-categorization.types';
import type {BankTransactionCategory} from '../../categorization/bank-transaction-category';
import type {OwnTransferEvidence, OwnTransferOverride} from '../../own-transfer/own-transfer-detection';
import type {BankTransactionBaseAmountMethod} from '../../services/bank-transaction-amount-conversion.utils';

export class BankTransactionOwnTransferCounterpartDto {
	id: string;
	bankName: string;
	bankAccountName: string | null;
	bankAccountAlias: string | null;
	amount: string;
	currency: string;
	bookingDate: string | null;
}

export class BankTransactionOwnTransferDto {
	evidence: OwnTransferEvidence;
	/** The other leg, or null when no matching transaction is in the connected accounts. */
	counterpart: BankTransactionOwnTransferCounterpartDto | null;
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
	category: BankTransactionCategory | null;
	categoryStatus: BankTransactionCategorizationStatus;
	categorySource: BankTransactionCategorizationSource | null;
	financialEventType: BankTransactionFinancialEventType | null;
	financialEventSource: BankTransactionFinancialEventSource | null;
	financialEventRuleVersion: string | null;
	cashFlowTreatment: BankTransactionCashFlowTreatment;
	ownTransfer: BankTransactionOwnTransferDto | null;
	ownTransferOverride: OwnTransferOverride | null;
	categoryConfidence: string | null;
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
	/** How the base-currency amount was derived; null while unconverted. */
	baseAmountMethod: BankTransactionBaseAmountMethod | null;
	/** The ECB reference rate date used when `baseAmountMethod` is `ECB`. */
	baseAmountRateDate: string | null;
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
