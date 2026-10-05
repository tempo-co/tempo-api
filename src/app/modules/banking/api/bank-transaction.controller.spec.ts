import {ExecutionContext, HttpException, HttpStatus} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {ThrottlerGuard, ThrottlerStorageService} from '@nestjs/throttler';
import ms from 'ms';

import {BankTransactionController} from './bank-transaction.controller';

/** The production throttler: unnamed, so route-level `default` metadata applies. */
const PRODUCTION_THROTTLERS = {throttlers: [{ttl: ms('1m'), limit: 100}]};
const CLIENT_IP = '203.0.113.10';

function createContext(handler: (...args: never[]) => unknown): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => ({ip: CLIENT_IP, headers: {}}),
			getResponse: () => ({header: jest.fn()}),
		}),
		getHandler: () => handler,
		getClass: () => BankTransactionController,
	} as unknown as ExecutionContext;
}

async function countAllowed(handler: (...args: never[]) => unknown, attempts: number) {
	const storage = new ThrottlerStorageService();
	const guard = new ThrottlerGuard(PRODUCTION_THROTTLERS, storage, new Reflector());
	await guard.onModuleInit();
	let allowed = 0;
	try {
		for (let attempt = 0; attempt < attempts; attempt++) {
			const status = await guard.canActivate(createContext(handler)).then(
				() => HttpStatus.OK,
				(error: HttpException) => error.getStatus(),
			);
			if (status === HttpStatus.OK) allowed++;
			else expect(status).toBe(HttpStatus.TOO_MANY_REQUESTS);
		}
	} finally {
		storage.onApplicationShutdown();
	}
	return allowed;
}

describe('BankTransactionController rate limits', () => {
	it.each(['findAll', 'getSummary'] as const)('allows 300 %s requests per minute', async (method) => {
		await expect(countAllowed(BankTransactionController.prototype[method], 301)).resolves.toBe(300);
	});
});
