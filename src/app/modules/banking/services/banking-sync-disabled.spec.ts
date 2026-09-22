import {BankingSyncService} from './banking-sync.service';

it('does not synchronize automatically when banking integration is disabled', async () => {
	const findOne = jest.fn();
	const runSynchronization = jest.fn();
	const service = Object.assign(Object.create(BankingSyncService.prototype), {
		bankConnectionRepository: {findOne},
		runSynchronization,
		configurationService: {get: jest.fn(() => false)},
	}) as BankingSyncService;

	await expect(service.synchronizeAutomatically('connection-id')).resolves.toBeNull();
	expect(findOne).not.toHaveBeenCalled();
	expect(runSynchronization).not.toHaveBeenCalled();
});
