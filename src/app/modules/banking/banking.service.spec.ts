import {createHash} from 'node:crypto';
import {Repository} from 'typeorm';

import {BankConnection} from './bank-connection.entity';
import {BankingService} from './banking.service';
import {BankingAuthorizationStateService} from './services/banking-authorization-state.service';

function hashState(state: string): string {
	return createHash('sha256').update(state).digest('hex');
}

describe('BankingService authorization state lifecycle', () => {
	it('does not expire a newer authorization state for the same connection', async () => {
		const expiredState = 'expired-state';
		const newerState = 'newer-state';
		const connection = {
			id: 'connection-id',
			status: 'PENDING_AUTHORIZATION',
			authorizationStateHash: hashState(newerState),
		};
		const bankConnectionRepository = {
			update: jest
				.fn()
				.mockImplementation((criteria: {status: string; authorizationStateHash: string}) =>
					Promise.resolve(
						criteria.status === connection.status &&
							criteria.authorizationStateHash === connection.authorizationStateHash
							? {affected: 1}
							: {affected: 0},
					),
				),
		};
		const authorizationStateService = {
			consumeWithStatus: jest.fn().mockResolvedValue(null),
		};
		const service = new BankingService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			authorizationStateService as unknown as BankingAuthorizationStateService,
			{} as never,
		);

		await expect(service.handleCallback({state: expiredState, code: 'late-provider-code'})).resolves.toBe('error');

		expect(connection).toMatchObject({
			status: 'PENDING_AUTHORIZATION',
			authorizationStateHash: hashState(newerState),
		});
		expect(bankConnectionRepository.update).toHaveBeenCalledWith(
			{authorizationStateHash: hashState(expiredState), status: 'PENDING_AUTHORIZATION'},
			{status: 'FAILED', authorizationStateHash: null},
		);
	});

	it('does not authorize a callback after the pending state is replaced during the callback race', async () => {
		const callbackState = 'racing-state';
		const state = {
			accountId: 'account-id',
			connectionId: 'connection-id',
			aspspName: 'ABN AMRO',
			aspspCountry: 'NL',
			expiresAt: Date.now() + 60_000,
		};
		const connection = {
			id: state.connectionId,
			status: 'PENDING_AUTHORIZATION',
			authorizationStateHash: hashState(callbackState),
		};
		const transactionConnectionRepository = {
			findOne: jest.fn().mockResolvedValue(null),
		};
		const bankConnectionRepository = {
			findOne: jest.fn().mockResolvedValue(connection),
			update: jest.fn().mockResolvedValue({affected: 0}),
		};
		const dataSource = {
			transaction: jest.fn(async (callback: (manager: unknown) => Promise<void>) =>
				callback({
					getRepository: jest.fn((entity: unknown) =>
						entity === BankConnection ? transactionConnectionRepository : {},
					),
				}),
			),
		};
		const authorizationStateService = {
			consumeWithStatus: jest.fn().mockResolvedValue({status: 'consumed', state}),
		};
		const service = new BankingService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			dataSource as never,
			{
				createSession: jest.fn().mockResolvedValue({
					sessionId: 'provider-session',
					consentValidUntil: '2030-01-01T00:00:00.000Z',
					aspsp: {name: 'ABN AMRO', country: 'NL'},
					accounts: [],
				}),
			} as never,
			authorizationStateService as unknown as BankingAuthorizationStateService,
			{encrypt: jest.fn().mockReturnValue('encrypted-session')} as never,
		);

		await expect(service.handleCallback({state: callbackState, code: 'provider-code'})).resolves.toBe('error');

		expect(transactionConnectionRepository.findOne).toHaveBeenCalledWith({
			where: {
				id: state.connectionId,
				status: 'PENDING_AUTHORIZATION',
				authorizationStateHash: hashState(callbackState),
				account: {id: state.accountId},
			},
			lock: {mode: 'pessimistic_write'},
		});
		expect(bankConnectionRepository.update).toHaveBeenCalledWith(
			{id: state.connectionId, status: 'PENDING_AUTHORIZATION', authorizationStateHash: hashState(callbackState)},
			{status: 'FAILED', authorizationStateHash: null},
		);
	});
});
