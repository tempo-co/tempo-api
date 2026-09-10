export class BankAccountResponseDto {
	id: string;
	name: string | null;
	details: string | null;
	alias: string | null;
	currency: string;
	cashAccountType: string | null;
	usage: string | null;
	maskedIdentifier: string | null;
	currentBalanceAmount: string | null;
	currentBalanceType: string | null;
	balanceUpdatedAt: Date | null;
	isActive: boolean;
	latestBalances: BankAccountBalanceResponseDto[];
}

export class BankAccountBalanceResponseDto {
	name: string | null;
	balanceType: string;
	amount: string;
	currency: string;
	lastChangeDateTime: Date | null;
	referenceDate: string | null;
	observedAt: Date;
	isPrimary: boolean;
}

export class BankConnectionResponseDto {
	id: string;
	provider: string;
	aspspName: string;
	aspspCountry: string;
	status: string;
	consentValidUntil: Date | null;
	lastSyncedAt: Date | null;
	bankAccounts: BankAccountResponseDto[];
}

export class BankConnectionTransactionResponseDto {
	id: string;
	bookingDate: string | null;
	valueDate: string | null;
	amount: string;
	currency: string;
	creditDebitIndicator: string | null;
	transactionStatus: string | null;
	description: string | null;
	displayDescription: string;
	counterpartyName: string | null;
	merchantCategoryCode: string | null;
	remittanceInformation: string | null;
}

export class BankConnectionTransactionsResponseDto {
	transactions: BankConnectionTransactionResponseDto[];
	total: number;
}

export class BankSyncRunResponseDto {
	id: string;
	status: string;
	startedAt: Date;
	finishedAt: Date | null;
	requestedFrom: string | null;
	requestedTo: string | null;
	accountsFetched: number;
	balancesFetched: number;
	transactionsFetched: number;
	transactionsAdded: number;
	errorMessage: string | null;
	rateLimitSource: 'enable-banking' | null;
	retryAfterSeconds: number | null;
}
