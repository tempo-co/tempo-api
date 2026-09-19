export type BankTransferLinkResponseDto = {
	legATransactionId: string;
	legBTransactionId: string;
	evidence: {
		currency: string;
		amountDelta: string;
		dateDeltaDays: number;
		matchedOn: string;
	};
	ruleVersion: string;
};
