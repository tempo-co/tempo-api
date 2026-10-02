import {Injectable, Logger} from '@nestjs/common';
import {DataSource} from 'typeorm';

import {Account} from '@modules/account/account.entity';

import {safeErrorName} from '../banking.utils';
import type {OwnTransferOverride} from '../own-transfer/own-transfer-detection';
import {
	OwnTransferRecomputeResult,
	lockOwnTransfers,
	recomputeOwnTransfers,
} from '../own-transfer/own-transfer-recompute';

@Injectable()
export class OwnTransferService {
	private readonly logger = new Logger(OwnTransferService.name);

	constructor(private readonly dataSource: DataSource) {}

	async recomputeForOwner(ownerId: Account['id']): Promise<OwnTransferRecomputeResult> {
		const startedAt = Date.now();
		const result = await this.dataSource.transaction((manager) => recomputeOwnTransfers(manager, ownerId));
		if (result.transactionsChanged > 0 || result.accountIbansAdded > 0) {
			this.logger.log(
				`Own transfers recomputed: ${result.transactionsChanged} transactions changed, ` +
					`${result.accountIbansAdded} account IBANs added in ${Date.now() - startedAt} ms`,
			);
		}
		return result;
	}

	/**
	 * Stores the owner's decision for one transaction and recomputes in the same transaction, so both
	 * legs of a pair change together. Returns false when the transaction is not the owner's.
	 */
	async updateOverride(
		ownerId: Account['id'],
		transactionId: string,
		override: OwnTransferOverride | null,
	): Promise<boolean> {
		return this.dataSource.transaction(async (manager) => {
			await lockOwnTransfers(manager, ownerId);
			const [updated] = (await manager.query(
				`UPDATE "bank_transactions" transaction SET "ownTransferOverride" = $1
				FROM "bank_accounts" account, "bank_connections" connection
				WHERE transaction."id" = $2 AND account."id" = transaction."bankAccountId"
					AND connection."id" = account."bankConnectionId" AND connection."accountId" = $3
				RETURNING transaction."id"`,
				[override, transactionId, ownerId],
			)) as [unknown[], number];
			if (updated.length === 0) return false;

			await recomputeOwnTransfers(manager, ownerId);
			return true;
		});
	}

	/** Recomputes after a bank change without failing the caller; the next change recomputes again. */
	async recomputeForOwnerSafely(ownerId: Account['id']): Promise<void> {
		try {
			await this.recomputeForOwner(ownerId);
		} catch (error) {
			this.logger.warn(`Own-transfer recompute failed: ${safeErrorName(error)}`);
		}
	}
}
