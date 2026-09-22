import {Repository} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';

import {BankAccountBalance} from './bank-account-balance.entity';
import {BankAccount} from './bank-account.entity';
import {BankConnection} from './bank-connection.entity';
import {BankingService} from './banking.service';

it('rejects authorization before touching a provider when banking is disabled', async () => {
	const bankConnectionRepository = {
		findOne: jest.fn(),
		save: jest.fn(),
	};
	const enableBankingClient = {
		getAspsps: jest.fn(),
		startAuthorization: jest.fn(),
	};
	const configurationService = {
		get: jest.fn((key: string) => (key === 'BANKING_INTEGRATION_ENABLED' ? false : undefined)),
	};
	const service = new BankingService(
		bankConnectionRepository as unknown as Repository<BankConnection>,
		{} as Repository<BankAccount>,
		{} as Repository<BankAccountBalance>,
		{} as never,
		configurationService as unknown as ConfigurationService,
		{} as never,
		enableBankingClient as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
	);

	await expect(
		service.startAuthorization('account-id', {aspspName: 'Example Bank', aspspCountry: 'NL'} as never),
	).rejects.toMatchObject({status: 503});

	expect(bankConnectionRepository.findOne).not.toHaveBeenCalled();
	expect(enableBankingClient.getAspsps).not.toHaveBeenCalled();
	expect(enableBankingClient.startAuthorization).not.toHaveBeenCalled();
});
