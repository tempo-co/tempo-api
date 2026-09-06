import {createWebUrl} from './web-url';

describe('createWebUrl', () => {
	it('resolves application paths below a mounted base path', () => {
		expect(createWebUrl('/bank-connections', 'https://example.ts.net/flair')).toBe(
			'https://example.ts.net/flair/bank-connections',
		);
	});

	it('resolves application paths from a root base URL', () => {
		expect(createWebUrl('/bank-connections', 'http://localhost:5173')).toBe(
			'http://localhost:5173/bank-connections',
		);
	});
});
