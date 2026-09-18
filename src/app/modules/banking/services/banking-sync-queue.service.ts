import {InjectQueue} from '@nestjs/bullmq';
import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Queue} from 'bullmq';
import ms from 'ms';
import {LessThanOrEqual, Not, Repository} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {
	BANK_CONNECTION_SYNC_QUEUE,
	BANK_CONNECTION_SYNC_SCHEDULER_ID,
	DISPATCH_BANK_CONNECTION_SYNCS_JOB,
	SYNC_BANK_CONNECTION_JOB,
} from '@core/queue/queue.constants';

import {BankConnection} from '../bank-connection.entity';
import {BankingConnectionLockService} from './banking-connection-lock.service';
import {BANK_SYNC_STATUSES} from './banking-sync.constants';

export type BankConnectionSyncJobData = {
	connectionId?: string;
};

const AUTHORIZED = 'AUTHORIZED';
const MAX_DISPATCH_BATCH = 100;
const ACTIVE_JOB_STATES = new Set(['active', 'delayed', 'prioritized', 'waiting', 'waiting-children']);

@Injectable()
export class BankingSyncQueueService implements OnModuleInit {
	private readonly logger = new Logger(BankingSyncQueueService.name);

	constructor(
		@InjectRepository(BankConnection)
		private readonly bankConnectionRepository: Repository<BankConnection>,
		@InjectQueue(BANK_CONNECTION_SYNC_QUEUE)
		private readonly queue: Queue<BankConnectionSyncJobData>,
		private readonly configurationService: ConfigurationService,
		private readonly connectionLockService: BankingConnectionLockService,
	) {}

	async onModuleInit(): Promise<void> {
		if (this.configurationService.get('NODE_ENV') === 'test') return;

		await this.queue.upsertJobScheduler(
			BANK_CONNECTION_SYNC_SCHEDULER_ID,
			{every: this.getDispatchIntervalMs()},
			{
				name: DISPATCH_BANK_CONNECTION_SYNCS_JOB,
				data: {},
				opts: {attempts: 1, removeOnComplete: true, removeOnFail: {age: 86_400, count: 100}},
			},
		);
	}

	async enqueueInitialSync(connectionId: BankConnection['id']): Promise<void> {
		await this.enqueueConnectionSync(connectionId, true);
	}

	async dispatchDueConnections(now = new Date()): Promise<number> {
		const staleBefore = new Date(now.getTime() - this.getRunningTimeoutMs());
		const connections = await this.bankConnectionRepository
			.createQueryBuilder('connection')
			.where('connection.status = :status', {status: AUTHORIZED})
			.andWhere(
				'(connection.nextSyncAt <= :now OR (connection.syncStatus = :running AND connection.syncStartedAt <= :staleBefore))',
				{now, running: BANK_SYNC_STATUSES.RUNNING, staleBefore},
			)
			.orderBy('connection.nextSyncAt', 'ASC')
			.addOrderBy('connection.id', 'ASC')
			.take(MAX_DISPATCH_BATCH)
			.getMany();
		let enqueued = 0;

		for (const connection of connections) {
			if (!this.isSynchronizationDue(connection, now)) continue;
			if (
				connection.syncStatus === BANK_SYNC_STATUSES.RUNNING &&
				(await this.connectionLockService.isHeld(connection.id))
			) {
				continue;
			}

			const didEnqueue = await this.enqueueConnectionSync(connection.id, false);
			if (!didEnqueue) continue;

			const updateWhere =
				connection.syncStatus === BANK_SYNC_STATUSES.RUNNING
					? {
							id: connection.id,
							status: AUTHORIZED,
							syncStatus: BANK_SYNC_STATUSES.RUNNING,
							syncStartedAt: LessThanOrEqual(staleBefore),
						}
					: {
							id: connection.id,
							status: AUTHORIZED,
							nextSyncAt: LessThanOrEqual(now),
							syncStatus: Not(BANK_SYNC_STATUSES.RUNNING),
						};
			const updateResult = await this.bankConnectionRepository.update(updateWhere, {
				nextSyncAt: connection.syncStatus === BANK_SYNC_STATUSES.RUNNING ? now : connection.nextSyncAt,
				syncStatus: BANK_SYNC_STATUSES.QUEUED,
			});
			if (updateResult.affected !== 1) continue;
			enqueued += 1;
		}

		return enqueued;
	}

	public isSynchronizationDue(connection: BankConnection, now = new Date()): boolean {
		if (connection.status !== AUTHORIZED) return false;
		const due = connection.nextSyncAt !== null && connection.nextSyncAt.getTime() <= now.getTime();
		if (connection.syncStatus !== BANK_SYNC_STATUSES.RUNNING) return due;

		const staleBefore = new Date(now.getTime() - this.getRunningTimeoutMs());
		return connection.syncStartedAt !== null && connection.syncStartedAt.getTime() <= staleBefore.getTime();
	}

	private async enqueueConnectionSync(connectionId: string, initial: boolean): Promise<boolean> {
		const jobId = this.getJobId(connectionId);
		const existingJob = await this.queue.getJob(jobId);
		if (existingJob) {
			const state = await existingJob.getState();
			if (ACTIVE_JOB_STATES.has(state)) return true;
			await existingJob.remove();
		}

		await this.queue.add(
			SYNC_BANK_CONNECTION_JOB,
			{connectionId},
			{
				jobId,
				priority: initial ? 1 : 10,
				attempts: 1,
				removeOnComplete: true,
				removeOnFail: {age: 86_400, count: 500},
			},
		);
		this.logger.debug(`Queued automatic bank synchronization for ${connectionId}.`);
		return true;
	}

	private getJobId(connectionId: string): string {
		return `bank-connection-sync-${connectionId}`;
	}

	private getRunningTimeoutMs(): number {
		const value = ms(this.configurationService.get('BANKING_SYNC_RUNNING_TIMEOUT') as ms.StringValue);
		if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
			throw new Error('BANKING_SYNC_RUNNING_TIMEOUT must be a positive duration.');
		}
		return value;
	}

	private getDispatchIntervalMs(): number {
		const value = ms(this.configurationService.get('BANKING_SYNC_DISPATCH_INTERVAL') as ms.StringValue);
		if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
			throw new Error('BANKING_SYNC_DISPATCH_INTERVAL must be a positive duration.');
		}
		return value;
	}
}
