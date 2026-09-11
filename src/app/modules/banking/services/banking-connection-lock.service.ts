import {ConflictException, Inject, Injectable, Logger, ServiceUnavailableException} from '@nestjs/common';
import Redis from 'ioredis';
import {randomUUID} from 'node:crypto';

import {REDIS} from '@core/redis/redis.constants';

import {
	BANKING_SERVICE_UNAVAILABLE,
	BANKING_SYNC_ALREADY_IN_PROGRESS,
} from '../api/constants/banking-messages.constants';

const LOCK_TTL_SECONDS = 15 * 60;
const LOCK_RENEWAL_INTERVAL_MS = (LOCK_TTL_SECONDS * 1000) / 3;
const LOCK_RENEWAL_TIMEOUT_MS = 15_000;
const LOCK_PREFIX = 'banking:sync:';
const LOCK_RENEW_SCRIPT =
	"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end";
const LOCK_RELEASE_SCRIPT =
	"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export type BankingConnectionLock = {
	signal: AbortSignal;
	assertHealthy: () => void;
	stop: () => void;
	release: () => Promise<void>;
};

@Injectable()
export class BankingConnectionLockService {
	private readonly logger = new Logger(BankingConnectionLockService.name);

	constructor(@Inject(REDIS) private readonly redis: Redis) {}

	async acquire(connectionId: string): Promise<BankingConnectionLock> {
		const lockToken = randomUUID();
		await this.acquireLock(connectionId, lockToken);
		const lockLease = this.startLockRenewal(connectionId, lockToken);

		return {
			...lockLease,
			release: async () => this.releaseLock(connectionId, lockToken),
		};
	}

	private async acquireLock(connectionId: string, token: string): Promise<void> {
		let result: string | null;
		try {
			result = await this.redis.set(`${LOCK_PREFIX}${connectionId}`, token, 'EX', LOCK_TTL_SECONDS, 'NX');
		} catch {
			throw new ServiceUnavailableException(BANKING_SERVICE_UNAVAILABLE);
		}

		if (result !== 'OK') throw new ConflictException(BANKING_SYNC_ALREADY_IN_PROGRESS);
	}

	private startLockRenewal(connectionId: string, token: string): Omit<BankingConnectionLock, 'release'> {
		const abortController = new AbortController();
		let renewalFailure: ServiceUnavailableException | undefined;
		let renewalInProgress = false;
		let stopped = false;

		const failRenewal = () => {
			if (stopped || renewalFailure) return;
			renewalFailure = new ServiceUnavailableException(BANKING_SERVICE_UNAVAILABLE);
			clearInterval(timer);
			abortController.abort();
			this.logger.warn('Bank connection mutation lock renewal failed; operation canceled.');
		};

		const renew = async () => {
			if (stopped || renewalFailure || renewalInProgress) return;
			renewalInProgress = true;
			try {
				if (!(await this.renewLock(connectionId, token))) failRenewal();
			} finally {
				renewalInProgress = false;
			}
		};

		const timer = setInterval(() => void renew(), LOCK_RENEWAL_INTERVAL_MS);

		return {
			signal: abortController.signal,
			assertHealthy: () => {
				if (renewalFailure) throw renewalFailure;
			},
			stop: () => {
				stopped = true;
				clearInterval(timer);
			},
		};
	}

	private async renewLock(connectionId: string, token: string): Promise<boolean> {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			const result = await Promise.race([
				this.redis.eval(LOCK_RENEW_SCRIPT, 1, `${LOCK_PREFIX}${connectionId}`, token, LOCK_TTL_SECONDS),
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error('Bank connection mutation lock renewal timed out.')),
						LOCK_RENEWAL_TIMEOUT_MS,
					);
				}),
			]);
			return result === 1 || result === '1';
		} catch {
			return false;
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}

	private async releaseLock(connectionId: string, token: string): Promise<void> {
		await this.redis.eval(LOCK_RELEASE_SCRIPT, 1, `${LOCK_PREFIX}${connectionId}`, token);
	}
}
