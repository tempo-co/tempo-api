import type {BankTransactionIdentityInput} from './bank-transaction-identity';
import {
	allocateNextBankTransactionStableIdentityKey,
	assignBankTransactionStableIdentityKeys,
	createBankTransactionStableIdentityKeyForGroup,
	isLegacyBankTransactionDedupeKey,
} from './bank-transaction-identity';

describe('bank transaction stable identity assignment', () => {
	it('assigns repeated-entry occurrences independently of provider response order', () => {
		const sharedFields: BankTransactionIdentityInput = {
			bankAccountId: '10000000-0000-4000-8000-000000000001',
			entryReference: 'shared-entry-reference',
			transactionDate: '2026-09-01',
			bookingDate: '2026-09-01',
			valueDate: '2026-09-01',
			amount: '12.00',
			currency: 'EUR',
			creditDebitIndicator: 'DBIT',
			bankTransactionCode: 'PMNT',
			bankTransactionSubCode: 'CARD',
			bankTransactionDescription: 'Synthetic repeated payment',
			description: 'Synthetic repeated payment A',
			counterpartyName: 'Synthetic Counterparty',
			merchantLocation: null,
			merchantCategoryCode: null,
			remittanceInformation: null,
			instructedAmount: null,
			instructedCurrency: null,
			exchangeRate: null,
			exchangeRateUnitCurrency: null,
			exchangeRateType: null,
			referenceNumber: 'synthetic-reference-a',
			referenceNumberScheme: 'SYNTHETIC',
		};
		const first = {...sharedFields};
		const second = {
			...sharedFields,
			description: 'Synthetic repeated payment B',
			referenceNumber: 'synthetic-reference-b',
		};
		const identitiesByReference = (transactions: BankTransactionIdentityInput[]) =>
			new Map(
				assignBankTransactionStableIdentityKeys(transactions).map(({referenceNumber, stableIdentityKey}) => [
					referenceNumber ?? '',
					stableIdentityKey,
				]),
			);

		expect(identitiesByReference([first, second])).toEqual(identitiesByReference([second, first]));
	});

	it('reuses a unique no-reference core match when provider details change', () => {
		const first = {
			bankAccountId: '10000000-0000-4000-8000-000000000001',
			entryReference: null,
			transactionDate: '2026-09-01',
			bookingDate: '2026-09-01',
			valueDate: '2026-09-01',
			amount: '12.00',
			currency: 'EUR',
			creditDebitIndicator: 'DBIT',
			bankTransactionCode: null,
			bankTransactionSubCode: null,
			bankTransactionDescription: null,
			description: 'Synthetic detail before update',
			counterpartyName: 'Synthetic counterparty before update',
			merchantLocation: null,
			merchantCategoryCode: null,
			remittanceInformation: null,
			instructedAmount: null,
			instructedCurrency: null,
			exchangeRate: null,
			exchangeRateUnitCurrency: null,
			exchangeRateType: null,
			referenceNumber: null,
			referenceNumberScheme: null,
		};
		const initial = assignBankTransactionStableIdentityKeys([first]);
		const refreshed = assignBankTransactionStableIdentityKeys(
			[
				{
					...first,
					description: 'Synthetic detail after update',
					counterpartyName: 'Synthetic counterparty after update',
				},
			],
			initial,
		);

		expect(refreshed[0].stableIdentityKey).toBe(initial[0].stableIdentityKey);
	});

	it('keeps prior occurrence keys attached when one repeated-reference row changes mutable details', () => {
		const sharedFields: BankTransactionIdentityInput = {
			bankAccountId: '10000000-0000-4000-8000-000000000001',
			entryReference: 'shared-entry-reference',
			transactionDate: '2026-09-01',
			bookingDate: '2026-09-01',
			valueDate: '2026-09-01',
			amount: '12.00',
			currency: 'EUR',
			creditDebitIndicator: 'DBIT',
			bankTransactionCode: 'PMNT',
			bankTransactionSubCode: 'CARD',
			bankTransactionDescription: 'Synthetic repeated payment',
			description: 'Alpha',
			counterpartyName: 'Synthetic Counterparty',
			merchantLocation: null,
			merchantCategoryCode: null,
			remittanceInformation: null,
			instructedAmount: null,
			instructedCurrency: null,
			exchangeRate: null,
			exchangeRateUnitCurrency: null,
			exchangeRateType: null,
			referenceNumber: 'reference-a',
			referenceNumberScheme: 'SYNTHETIC',
		};
		const first = {...sharedFields, logicalRow: 'first'};
		const second = {
			...sharedFields,
			logicalRow: 'second',
			description: 'Beta',
			referenceNumber: 'reference-b',
		};
		const initial = assignBankTransactionStableIdentityKeys([first, second]);
		const initialByRow = new Map(initial.map(({logicalRow, stableIdentityKey}) => [logicalRow, stableIdentityKey]));
		const persistedRows = initial.map((transaction) => ({
			...transaction,
			transactionDate: new Date('2026-09-01T00:00:00.000Z'),
			bookingDate: new Date('2026-09-01T00:00:00.000Z'),
			valueDate: new Date('2026-09-01T00:00:00.000Z'),
		})) as unknown as typeof initial;
		const refreshed = assignBankTransactionStableIdentityKeys(
			[{...first, description: 'Zulu', referenceNumber: 'reference-z'}, second],
			persistedRows,
		);

		expect(new Map(refreshed.map(({logicalRow, stableIdentityKey}) => [logicalRow, stableIdentityKey]))).toEqual(
			initialByRow,
		);

		const dateStyleRows = initial.map((transaction) => ({
			...transaction,
			transactionDate: null,
			bookingDate: null,
			valueDate: null,
		}));
		const refreshedWithUnparsedDatabaseDates = assignBankTransactionStableIdentityKeys(
			[first, second],
			dateStyleRows,
		);

		expect(
			new Map(
				refreshedWithUnparsedDatabaseDates.map(({logicalRow, stableIdentityKey}) => [
					logicalRow,
					stableIdentityKey,
				]),
			),
		).toEqual(initialByRow);
	});

	it('matches an existing occurrence when PostgreSQL renders stored dates in a different DateStyle', () => {
		const transaction: BankTransactionIdentityInput = {
			bankAccountId: '10000000-0000-4000-8000-000000000001',
			entryReference: 'synthetic-entry-reference',
			transactionDate: '2026-09-01',
			bookingDate: '2026-09-01',
			valueDate: '2026-09-01',
			amount: '-12.00',
			currency: 'EUR',
			creditDebitIndicator: 'DBIT',
			bankTransactionCode: 'PMNT',
			bankTransactionSubCode: 'CARD',
			bankTransactionDescription: 'Synthetic transaction',
			description: 'Synthetic detail',
			counterpartyName: 'Synthetic counterparty',
			merchantLocation: null,
			merchantCategoryCode: null,
			remittanceInformation: null,
			instructedAmount: null,
			instructedCurrency: null,
			exchangeRate: null,
			exchangeRateUnitCurrency: null,
			exchangeRateType: null,
			referenceNumber: 'synthetic-reference',
			referenceNumberScheme: 'SYNTHETIC',
		};
		const [initial] = assignBankTransactionStableIdentityKeys([transaction]);
		const persisted = {
			...initial,
			transactionDate: '01/09/2026',
			bookingDate: '01/09/2026',
			valueDate: '01/09/2026',
		};
		const [refreshed] = assignBankTransactionStableIdentityKeys([transaction], [persisted]);

		expect(refreshed.stableIdentityKey).toBe(initial.stableIdentityKey);
	});

	it('does not recycle occurrence keys when multiple same-core rows change ambiguously', () => {
		const sharedFields: BankTransactionIdentityInput = {
			bankAccountId: '10000000-0000-4000-8000-000000000001',
			entryReference: null,
			transactionDate: '2026-09-01',
			bookingDate: '2026-09-01',
			valueDate: '2026-09-01',
			amount: '12.00',
			currency: 'EUR',
			creditDebitIndicator: 'DBIT',
			bankTransactionCode: null,
			bankTransactionSubCode: null,
			bankTransactionDescription: null,
			description: 'Synthetic payment A',
			counterpartyName: null,
			merchantLocation: null,
			merchantCategoryCode: null,
			remittanceInformation: null,
			instructedAmount: null,
			instructedCurrency: null,
			exchangeRate: null,
			exchangeRateUnitCurrency: null,
			exchangeRateType: null,
			referenceNumber: null,
			referenceNumberScheme: null,
		};
		const initial = assignBankTransactionStableIdentityKeys([
			{...sharedFields, logicalRow: 'first'},
			{...sharedFields, logicalRow: 'second', description: 'Synthetic payment B'},
		]);
		const refreshed = assignBankTransactionStableIdentityKeys(
			[
				{...sharedFields, logicalRow: 'first', description: 'Synthetic payment C'},
				{...sharedFields, logicalRow: 'second', description: 'Synthetic payment D'},
			],
			initial,
		);
		const previousKeys = new Set(initial.map(({stableIdentityKey}) => stableIdentityKey));

		expect(refreshed.every(({stableIdentityKey}) => !previousKeys.has(stableIdentityKey))).toBe(true);
		expect(new Set(refreshed.map(({stableIdentityKey}) => stableIdentityKey)).size).toBe(2);
	});

	it('allocates the next unused occurrence key within an identity group', () => {
		const firstKey = createBankTransactionStableIdentityKeyForGroup('synthetic-group', 1);
		const secondKey = createBankTransactionStableIdentityKeyForGroup('synthetic-group', 2);

		const allocation = allocateNextBankTransactionStableIdentityKey('synthetic-group', new Set([firstKey]));

		expect(allocation).toEqual({stableIdentityKey: secondKey, nextOccurrence: 3});
	});

	it('recognizes legacy SHA-256 dedupe keys', () => {
		expect(isLegacyBankTransactionDedupeKey('a'.repeat(64))).toBe(true);
		expect(isLegacyBankTransactionDedupeKey('123e4567-e89b-42d3-a456-426614174000')).toBe(false);
		expect(isLegacyBankTransactionDedupeKey(null)).toBe(false);
	});
});
