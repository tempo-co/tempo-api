import {
	BadGatewayException,
	BadRequestException,
	ConflictException,
	HttpException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {createHash} from 'node:crypto';
import {DataSource, In, Repository} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';

import {
	BANKING_AUTHORIZATION_START_FAILED,
	BANKING_CONNECTION_NOT_FOUND,
	BANKING_CONNECTION_NOT_REMOVABLE,
	BANKING_SELECTED_BANK_UNAVAILABLE,
	BANKING_SERVICE_UNAVAILABLE,
	BANKING_SUPPORTED_BANKS_UNAVAILABLE,
} from './api/constants/banking-messages.constants';
import {BankConnectionAuthorizeDto} from './api/dtos/bank-connection-authorize.dto';
import {BankConnectionCallbackDto} from './api/dtos/bank-connection-callback.dto';
import {BankAccountResponseDto, BankConnectionResponseDto} from './api/dtos/bank-connection-response.dto';
import {BankAccountBalance} from './bank-account-balance.entity';
import {BankAccount} from './bank-account.entity';
import {BankConnectionCallbackResult} from './bank-connection-callback-result';
import {BankConnection} from './bank-connection.entity';
import {getBalancePreference, truncate} from './banking.utils';
import {EnableBankingAccount, EnableBankingSession} from './enable-banking.types';
import {BankingAuthorizationStateError} from './errors/banking-authorization-state.error';
import {BankingEncryptionError} from './errors/banking-encryption.error';
import {BankingAuthorizationStateService} from './services/banking-authorization-state.service';
import {BankingEncryptionService} from './services/banking-encryption.service';
import {EnableBankingClient, EnableBankingClientError} from './services/enable-banking.client';

const PROVIDER = 'enable-banking';
const PENDING_AUTHORIZATION = 'PENDING_AUTHORIZATION';
const AUTHORIZED = 'AUTHORIZED';
const CANCELLED = 'CANCELLED';
const FAILED = 'FAILED';
const EXPIRED = 'EXPIRED';
const REMOVABLE_CONNECTION_STATUSES = [PENDING_AUTHORIZATION, CANCELLED, FAILED] as const;

@Injectable()
export class BankingService {
	private readonly logger = new Logger(BankingService.name);

	constructor(
		@InjectRepository(BankConnection)
		private readonly bankConnectionRepository: Repository<BankConnection>,
		@InjectRepository(BankAccount)
		private readonly bankAccountRepository: Repository<BankAccount>,
		@InjectRepository(BankAccountBalance)
		private readonly bankAccountBalanceRepository: Repository<BankAccountBalance>,
		private readonly accountService: AccountService,
		private readonly configurationService: ConfigurationService,
		private readonly dataSource: DataSource,
		private readonly enableBankingClient: EnableBankingClient,
		private readonly authorizationStateService: BankingAuthorizationStateService,
		private readonly encryptionService: BankingEncryptionService,
	) {}

	async startAuthorization(
		accountId: Account['id'],
		dto: BankConnectionAuthorizeDto,
	): Promise<{authorizationUrl: string}> {
		const aspspName = dto.aspspName.trim();
		const aspspCountry = dto.aspspCountry.toUpperCase();
		const aspsps = await this.getAspsps(aspspCountry);
		const aspsp = aspsps.find((candidate) => candidate.name === aspspName && candidate.country === aspspCountry);

		if (!aspsp) {
			throw new BadRequestException(BANKING_SELECTED_BANK_UNAVAILABLE);
		}

		const account = await this.accountService.findById(accountId);
		const connection = await this.bankConnectionRepository.save(
			this.bankConnectionRepository.create({
				account,
				provider: PROVIDER,
				aspspName: aspsp.name,
				aspspCountry: aspsp.country,
				status: PENDING_AUTHORIZATION,
			}),
		);

		let state: string | undefined;

		try {
			state = await this.authorizationStateService.create({
				accountId: account.id,
				connectionId: connection.id,
				aspspName: aspsp.name,
				aspspCountry: aspsp.country,
			});
			const authorizationStateHash = this.hashAuthorizationState(state);
			const bindingResult = await this.bankConnectionRepository.update(
				{id: connection.id, status: PENDING_AUTHORIZATION},
				{authorizationStateHash},
			);
			if (bindingResult.affected === 0) {
				throw new Error('Bank connection authorization was superseded.');
			}

			const authorization = await this.enableBankingClient.startAuthorization({
				state,
				redirectUrl: this.configurationService.get('ENABLE_BANKING_REDIRECT_URL'),
				psuId: account.id,
				aspsp: {name: aspsp.name, country: aspsp.country},
				validUntil: new Date(Date.now() + aspsp.maximumConsentValiditySeconds * 1000).toISOString(),
			});

			await this.authorizationStateService.setAuthorizationId(state, authorization.authorizationId);

			return {authorizationUrl: authorization.url};
		} catch (error) {
			if (state) {
				await this.authorizationStateService.delete(state).catch(() => undefined);
				await this.updatePendingAuthorization(
					{
						id: connection.id,
						status: PENDING_AUTHORIZATION,
						authorizationStateHash: this.hashAuthorizationState(state),
					},
					FAILED,
				);
			} else {
				await this.bankConnectionRepository.update(
					{id: connection.id, status: PENDING_AUTHORIZATION},
					{status: FAILED, authorizationStateHash: null},
				);
			}

			throw this.toAuthorizationStartException(error);
		}
	}

	async findAll(accountId: Account['id']): Promise<BankConnectionResponseDto[]> {
		const connections = await this.bankConnectionRepository
			.createQueryBuilder('connection')
			.where('connection.accountId = :accountId', {accountId})
			.orderBy('connection.createdAt', 'DESC')
			.getMany();

		return Promise.all(
			connections.map(async (connection) => {
				const bankAccounts = await this.bankAccountRepository.find({
					where: {bankConnection: {id: connection.id}},
					order: {createdAt: 'ASC'},
				});
				const accountsWithBalances = await Promise.all(
					bankAccounts.map(async (bankAccount) => {
						const latestBalances = await this.findLatestBalances(bankAccount.id);
						return [bankAccount, latestBalances] as const;
					}),
				);
				return {
					id: connection.id,
					provider: connection.provider,
					aspspName: connection.aspspName,
					aspspCountry: connection.aspspCountry,
					status: connection.status,
					consentValidUntil: connection.consentValidUntil,
					lastSyncedAt: connection.lastSyncedAt,
					bankAccounts: accountsWithBalances.map(([bankAccount, latestBalances]) =>
						this.toBankAccountResponse(bankAccount, latestBalances),
					),
				};
			}),
		);
	}

	async removeConnection(accountId: Account['id'], connectionId: BankConnection['id']): Promise<void> {
		await this.dataSource.transaction(async (manager) => {
			const connectionRepository = manager.getRepository(BankConnection);
			const bankAccountRepository = manager.getRepository(BankAccount);
			const connection = await connectionRepository.findOne({
				where: {id: connectionId, account: {id: accountId}},
				lock: {mode: 'pessimistic_write'},
			});

			if (!connection) throw new NotFoundException(BANKING_CONNECTION_NOT_FOUND);
			if (
				!REMOVABLE_CONNECTION_STATUSES.includes(
					connection.status as (typeof REMOVABLE_CONNECTION_STATUSES)[number],
				)
			) {
				throw new ConflictException(BANKING_CONNECTION_NOT_REMOVABLE);
			}
			if ((await bankAccountRepository.count({where: {bankConnection: {id: connection.id}}})) > 0) {
				throw new ConflictException(BANKING_CONNECTION_NOT_REMOVABLE);
			}

			await connectionRepository.remove(connection);
		});
	}

	async handleCallback(query: BankConnectionCallbackDto): Promise<BankConnectionCallbackResult> {
		try {
			return await this.handleCallbackInternal(query);
		} catch (error) {
			this.logger.warn(`Banking authorization callback failed: ${this.getSafeErrorCode(error)}`);
			return 'error';
		}
	}

	private async handleCallbackInternal(query: BankConnectionCallbackDto): Promise<BankConnectionCallbackResult> {
		const consumption = await this.authorizationStateService.consumeWithStatus(query.state);
		if (!consumption) {
			await this.expireAuthorization(query.state);
			return 'error';
		}
		if (consumption.status === 'already_consumed') return 'error';
		if (consumption.status !== 'consumed') {
			await this.expireAuthorization(query.state);
			return 'error';
		}
		if (!query.state) return 'error';

		const state = consumption.state;
		const authorizationStateHash = this.hashAuthorizationState(query.state);
		const pendingConnectionCriteria = {
			id: state.connectionId,
			status: PENDING_AUTHORIZATION,
			authorizationStateHash,
		};
		const connection = await this.bankConnectionRepository.findOne({
			where: {...pendingConnectionCriteria, account: {id: state.accountId}},
		});
		if (!connection) return 'error';

		if (query.error) {
			const status = this.isCancellation(query.error) ? CANCELLED : FAILED;
			const transitioned = await this.updatePendingAuthorization(pendingConnectionCriteria, status);
			return transitioned && status === CANCELLED ? 'cancelled' : 'error';
		}

		if (!query.code) {
			await this.updatePendingAuthorization(pendingConnectionCriteria, FAILED);
			return 'error';
		}

		try {
			const session = await this.enableBankingClient.createSession(query.code);
			await this.persistAuthorizedSession(state.accountId, connection.id, authorizationStateHash, session);
			return 'connected';
		} catch (error) {
			this.logger.warn(`Enable Banking authorization failed: ${this.getSafeErrorCode(error)}`);
			await this.updatePendingAuthorization(pendingConnectionCriteria, FAILED);
			return 'error';
		}
	}

	private async persistAuthorizedSession(
		accountId: Account['id'],
		connectionId: string,
		authorizationStateHash: string,
		session: EnableBankingSession,
	): Promise<void> {
		const consentValidUntil = new Date(session.consentValidUntil);
		if (Number.isNaN(consentValidUntil.getTime())) {
			throw new EnableBankingClientError('invalid_provider_response');
		}

		await this.dataSource.transaction(async (manager) => {
			const connectionRepository = manager.getRepository(BankConnection);
			const bankAccountRepository = manager.getRepository(BankAccount);

			const pendingConnection = await connectionRepository.findOne({
				where: {
					id: connectionId,
					status: PENDING_AUTHORIZATION,
					authorizationStateHash,
					account: {id: accountId},
				},
			});
			if (!pendingConnection) {
				throw new BankingAuthorizationStateError('state_superseded');
			}

			// Re-authorizing an ASPSP refreshes the existing connection instead of
			// creating a parallel one with duplicated bank accounts and transactions.
			const reusableConnection = await connectionRepository.findOne({
				where: {
					account: {id: accountId},
					provider: PROVIDER,
					aspspName: pendingConnection.aspspName,
					aspspCountry: pendingConnection.aspspCountry,
					status: In([AUTHORIZED, EXPIRED]),
				},
				order: {createdAt: 'DESC'},
			});
			const targetConnection = reusableConnection ?? pendingConnection;

			await connectionRepository.update(
				{id: targetConnection.id},
				{
					providerSessionId: this.encryptionService.encrypt(session.sessionId),
					status: AUTHORIZED,
					authorizationStateHash: null,
					aspspName: session.aspsp.name,
					aspspCountry: session.aspsp.country,
					consentValidUntil,
					lastSyncError: null,
				},
			);

			for (const account of session.accounts) {
				if (!account.uid) continue;

				const values = this.toBankAccountValues(account);
				let bankAccount = await bankAccountRepository.findOne({
					where: {bankConnection: {id: targetConnection.id}, providerAccountId: account.uid},
				});

				if (!bankAccount) {
					bankAccount = await bankAccountRepository.findOne({
						where: {
							bankConnection: {id: targetConnection.id},
							identificationHash: account.identificationHash,
						},
					});
				}

				if (!bankAccount) {
					bankAccount = bankAccountRepository.create({
						bankConnection: {id: targetConnection.id},
						...values,
					});
				} else {
					Object.assign(bankAccount, values);
				}

				await bankAccountRepository.save(bankAccount);
			}

			if (targetConnection.id !== pendingConnection.id) {
				await connectionRepository.delete({id: pendingConnection.id});
			}
		});
	}

	private async getAspsps(country: string) {
		try {
			return await this.enableBankingClient.getAspsps(country);
		} catch (error) {
			throw this.toProviderException(error, BANKING_SUPPORTED_BANKS_UNAVAILABLE);
		}
	}

	private async updatePendingAuthorization(
		criteria: {id: string; status: string; authorizationStateHash: string},
		status: string,
	): Promise<boolean> {
		const result = await this.bankConnectionRepository.update(criteria, {status, authorizationStateHash: null});
		return result.affected !== 0;
	}

	private async expireAuthorization(state: string | undefined): Promise<void> {
		if (!state || state.length > 256) return;

		await this.bankConnectionRepository.update(
			{authorizationStateHash: this.hashAuthorizationState(state), status: PENDING_AUTHORIZATION},
			{status: FAILED, authorizationStateHash: null},
		);
	}

	private hashAuthorizationState(state: string): string {
		return createHash('sha256').update(state).digest('hex');
	}

	private toBankAccountValues(account: EnableBankingAccount) {
		return {
			providerAccountId: account.uid as string,
			identificationHash: account.identificationHash,
			name: truncate(account.name, 255),
			details: truncate(account.details, 255),
			currency: account.currency.toUpperCase(),
			cashAccountType: truncate(account.cashAccountType, 32),
			usage: truncate(account.usage, 16),
		};
	}

	private async findLatestBalances(bankAccountId: string): Promise<BankAccountBalance[]> {
		return this.bankAccountBalanceRepository
			.createQueryBuilder('balance')
			.distinctOn(['balance.balanceType'])
			.where('balance.bankAccountId = :bankAccountId', {bankAccountId})
			.orderBy('balance.balanceType', 'ASC')
			.addOrderBy('balance.observedAt', 'DESC')
			.addOrderBy('balance.id', 'DESC')
			.getMany();
	}

	private toBankAccountResponse(account: BankAccount, latestBalances: BankAccountBalance[]): BankAccountResponseDto {
		const primaryBalance = this.selectPreferredBalance(latestBalances);

		return {
			id: account.id,
			name: account.name,
			details: account.details,
			alias: account.alias,
			currency: account.currency,
			cashAccountType: account.cashAccountType,
			usage: account.usage,
			maskedIdentifier: account.maskedIdentifier,
			currentBalanceAmount: account.currentBalanceAmount,
			currentBalanceType: account.currentBalanceType,
			balanceUpdatedAt: account.balanceUpdatedAt,
			isActive: account.isActive,
			latestBalances: latestBalances.map((balance) => ({
				name: balance.name,
				balanceType: balance.balanceType,
				amount: balance.amount,
				currency: balance.currency,
				lastChangeDateTime: balance.lastChangeDateTime,
				referenceDate: balance.referenceDate,
				observedAt: balance.observedAt,
				isPrimary: primaryBalance?.id === balance.id,
			})),
		};
	}

	private selectPreferredBalance(balances: BankAccountBalance[]): BankAccountBalance | undefined {
		return [...balances].sort((left, right) => {
			const rankDifference = getBalancePreference(right.balanceType) - getBalancePreference(left.balanceType);
			if (rankDifference !== 0) return rankDifference;
			return right.observedAt.getTime() - left.observedAt.getTime();
		})[0];
	}

	private isCancellation(error: string): boolean {
		return ['access_denied', 'cancelled', 'user_cancelled', 'user_canceled'].includes(error.toLowerCase());
	}

	private toProviderException(error: unknown, message: string): BadGatewayException {
		if (error instanceof BadGatewayException) return error;
		return new BadGatewayException(message);
	}

	private toAuthorizationStartException(error: unknown): HttpException {
		if (error instanceof BadRequestException) return error;

		if (error instanceof BankingAuthorizationStateError) {
			if (error.code === 'storage_unavailable' || error.code === 'write_failed') {
				return new ServiceUnavailableException(BANKING_SERVICE_UNAVAILABLE);
			}

			return new InternalServerErrorException(BANKING_AUTHORIZATION_START_FAILED);
		}

		if (error instanceof EnableBankingClientError) {
			return new BadGatewayException(BANKING_AUTHORIZATION_START_FAILED);
		}

		return new InternalServerErrorException(BANKING_AUTHORIZATION_START_FAILED);
	}

	private getSafeErrorCode(error: unknown): string {
		if (error instanceof EnableBankingClientError) return `provider_${this.toLogSafeCode(error.code)}`;
		if (error instanceof BankingAuthorizationStateError) return `authorization_state_${error.code}`;
		if (error instanceof BankingEncryptionError) return `encryption_${error.code}`;
		return 'internal_error';
	}

	private toLogSafeCode(value: string): string {
		return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
	}
}
