import {seedBankTransactionCategorizationData} from './e2e-categorization-data';
import {getApp} from './e2e.setup';

beforeAll(async () => {
	await seedBankTransactionCategorizationData(getApp());
});
