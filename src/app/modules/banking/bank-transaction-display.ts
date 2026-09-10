export function getBankTransactionDisplayDescription({
	description,
	counterpartyName,
}: {
	description: string | null | undefined;
	counterpartyName: string | null | undefined;
}): string {
	const normalizedDescription = normalizeBankTransactionText(description);
	const normalizedCounterpartyName = normalizeBankTransactionText(counterpartyName);

	if (!normalizedDescription) return normalizedCounterpartyName || 'Transaction';

	const structuredCounterpartyName = extractStructuredCounterpartyName(normalizedDescription);
	if (structuredCounterpartyName) return normalizedCounterpartyName || structuredCounterpartyName;

	const cardDescription = extractCardDescription(normalizedDescription);
	if (cardDescription) return cardDescription;

	if (normalizedCounterpartyName && normalizedDescription.length > 80) {
		return normalizedCounterpartyName;
	}

	return normalizedDescription;
}

function normalizeBankTransactionText(value: string | null | undefined): string | null {
	const normalizedValue = value?.replace(/\s+/g, ' ').trim();
	return normalizedValue || null;
}

function extractStructuredCounterpartyName(description: string): string | null {
	const match = description.match(/^sepa\b.*?\bnaam:\s*(.+?)(?=\s+(?:omschrijving|kenmerk|machtiging|iban|bic):|$)/i);
	return match?.[1]?.trim() || null;
}

function extractCardDescription(description: string): string | null {
	const googlePayMarker = description.match(/^(?:bea|gea),\s*google\s+pay\s+/i);
	const cardMarker = description.match(/^(?:bea|gea),\s*/i);
	const candidate = googlePayMarker
		? description.slice(googlePayMarker.index! + googlePayMarker[0].length)
		: cardMarker
			? description.slice(cardMarker[0].length)
			: null;

	if (!candidate) return null;

	const merchant = candidate.match(/^(.+?)(?=\s+nr:|,\s*\d{2}[./]\d{2}[./]\d{2}\/|$)/i);
	return merchant?.[1]?.trim() || null;
}
