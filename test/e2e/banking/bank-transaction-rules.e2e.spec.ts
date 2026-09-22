import {Server} from 'node:net';
import TestAgent from 'supertest/lib/agent';

import {VERIFIED_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_PASSWORD} from '../../../scripts/seed-data/seed.constants';
import {
	CATEGORIZATION_E2E_ACCOUNT_ID,
	CATEGORIZATION_E2E_AI_TRANSACTION_ID,
	seedBankTransactionCategorizationData,
} from '../../setup/e2e-categorization-data';
import {getApp, loginAgent} from '../../setup/e2e.setup';

describe('BankTransactionRuleController', () => {
	let httpServer: Server;
	let agent: TestAgent;

	beforeAll(async () => {
		const app = getApp();
		await seedBankTransactionCategorizationData(app);
		httpServer = app.getHttpServer();
		agent = await loginAgent(httpServer, VERIFIED_ACCOUNT_EMAIL, VERIFIED_ACCOUNT_PASSWORD);
	});

	it('previews, applies, preserves manual overrides, rejects conflicts, and deactivates rules', async () => {
		const draft = {
			sourceTransactionId: CATEGORIZATION_E2E_AI_TRANSACTION_ID,
			name: 'Synthetic card purchase rule',
			category: 'FOOD_AND_DRINK',
			matchField: 'BANK_TRANSACTION_DESCRIPTION',
			matchText: 'Card purchase',
		} as const;

		const previewResponse = await agent.post('/bank-transaction-rules/preview').send(draft).expect(201);
		expect(previewResponse.body).toMatchObject({
			bankAccountId: CATEGORIZATION_E2E_ACCOUNT_ID,
			direction: 'EXPENSE',
			transactionType: 'CARD_PAYMENT',
			currency: 'EUR',
			amount: '47.25',
			totalMatches: 1,
			existingManualMatches: 0,
			existingEligibleMatches: 1,
			conflictingRuleNames: [],
		});

		const createResponse = await agent
			.post('/bank-transaction-rules')
			.send({...draft, applyToExisting: true})
			.expect(201);
		expect(createResponse.body.rule).toMatchObject({
			name: draft.name,
			category: draft.category,
			active: true,
			amount: '47.25',
		});
		expect(createResponse.body.appliedToTransactionIds).toEqual([CATEGORIZATION_E2E_AI_TRANSACTION_ID]);

		const ruleId = createResponse.body.rule.id as string;
		const appliedTransaction = await agent
			.get(`/bank-transactions/${CATEGORIZATION_E2E_AI_TRANSACTION_ID}`)
			.expect(200);
		expect(appliedTransaction.body).toMatchObject({
			category: 'FOOD_AND_DRINK',
			categorySource: 'RULE',
			categoryRuleId: ruleId,
			categoryRuleName: draft.name,
		});

		const manualTransaction = await agent
			.patch(`/bank-transactions/${CATEGORIZATION_E2E_AI_TRANSACTION_ID}/category`)
			.send({category: 'SHOPPING'})
			.expect(200);
		expect(manualTransaction.body).toMatchObject({
			category: 'SHOPPING',
			categorySource: 'MANUAL',
			categoryRuleId: null,
			categoryRuleName: null,
		});

		await agent
			.post('/bank-transaction-rules')
			.send({...draft, name: 'Synthetic conflicting rule', category: 'HOUSING_AND_UTILITIES'})
			.expect(409);

		const deactivatedRule = await agent.delete(`/bank-transaction-rules/${ruleId}`).expect(200);
		expect(deactivatedRule.body).toMatchObject({id: ruleId, active: false});
	});
});
