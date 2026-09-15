import type {BankTransactionCategoryDefinition} from './bank-transaction-categorization.types';

export const BANK_TRANSACTION_CATEGORIES = [
	'HOUSING_AND_UTILITIES',
	'FOOD_AND_DRINK',
	'TRANSPORTATION',
	'SHOPPING',
	'SUBSCRIPTIONS',
	'HEALTH',
	'TRAVEL',
	'ENTERTAINMENT',
	'PERSONAL_CARE',
	'EDUCATION',
	'INSURANCE',
	'TAXES',
	'FEES',
	'CASH_WITHDRAWAL',
	'INCOME',
	'REFUND',
	'TRANSFER_IN',
	'TRANSFER_OUT',
	'OTHER',
] as const;

export type BankTransactionCategory = (typeof BANK_TRANSACTION_CATEGORIES)[number];

export const BANK_TRANSACTION_UNCATEGORIZED = 'UNCATEGORIZED' as const;
export const BANK_TRANSACTION_CATEGORY_FILTER_VALUES = [
	...BANK_TRANSACTION_CATEGORIES,
	BANK_TRANSACTION_UNCATEGORIZED,
] as const;
export type BankTransactionCategoryFilterValue = (typeof BANK_TRANSACTION_CATEGORY_FILTER_VALUES)[number];

export const BANK_TRANSACTION_CATEGORY_DEFINITIONS: readonly BankTransactionCategoryDefinition[] = [
	{
		value: 'HOUSING_AND_UTILITIES',
		label: 'Housing and utilities',
		description: 'Rent, mortgage, electricity, gas, water, internet, and mobile phone costs.',
	},
	{
		value: 'FOOD_AND_DRINK',
		label: 'Food and drink',
		description: 'Groceries, restaurants, cafes, takeaways, and other food or drink purchases.',
	},
	{
		value: 'TRANSPORTATION',
		label: 'Transportation',
		description: 'Fuel, public transport, parking, taxis, cycling, and vehicle costs.',
	},
	{
		value: 'SHOPPING',
		label: 'Shopping',
		description: 'General retail purchases, clothing, household goods, and other shopping.',
	},
	{
		value: 'SUBSCRIPTIONS',
		label: 'Subscriptions',
		description: 'Recurring digital, software, membership, media, and service charges.',
	},
	{
		value: 'HEALTH',
		label: 'Health',
		description: 'Doctors, dentists, pharmacies, therapy, medical treatment, and healthcare.',
	},
	{
		value: 'TRAVEL',
		label: 'Travel',
		description: 'Flights, hotels, accommodation, travel agencies, and holiday expenses.',
	},
	{
		value: 'ENTERTAINMENT',
		label: 'Entertainment',
		description: 'Cinema, concerts, games, hobbies, books, and recreational activities.',
	},
	{
		value: 'PERSONAL_CARE',
		label: 'Personal care',
		description: 'Hairdressers, beauty services, cosmetics, and personal care products.',
	},
	{
		value: 'EDUCATION',
		label: 'Education',
		description: 'Schools, courses, tuition, training, educational materials, and childcare education.',
	},
	{
		value: 'INSURANCE',
		label: 'Insurance',
		description: 'Insurance premiums and insurance-related payments.',
	},
	{
		value: 'TAXES',
		label: 'Taxes',
		description: 'Income tax, property tax, municipal tax, and other government taxes.',
	},
	{
		value: 'FEES',
		label: 'Fees',
		description: 'Bank fees, service charges, commissions, and other transaction fees.',
	},
	{
		value: 'CASH_WITHDRAWAL',
		label: 'Cash withdrawal',
		description: 'Cash withdrawn from an ATM, bank counter, or other cash service.',
	},
	{
		value: 'INCOME',
		label: 'Income',
		description: 'Salary, wages, interest, benefits, and other earned or recurring income.',
	},
	{
		value: 'REFUND',
		label: 'Refund',
		description: 'Money returned for a purchase, reimbursement, reversal, or credit note.',
	},
	{
		value: 'TRANSFER_IN',
		label: 'Transfer in',
		description: 'A transfer received from another account or person, excluding ordinary income.',
	},
	{
		value: 'TRANSFER_OUT',
		label: 'Transfer out',
		description: 'A transfer sent to another account or person, excluding ordinary spending.',
	},
	{
		value: 'OTHER',
		label: 'Other',
		description: 'Use when the available transaction fields do not support a more specific category.',
	},
];
