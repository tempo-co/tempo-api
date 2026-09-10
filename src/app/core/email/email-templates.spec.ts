import Handlebars from 'handlebars';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const templatesDirectory = join(__dirname, 'templates');
const fontStack = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const designTokens = {
	background: '#F6F1E8',
	border: '#D0C8B9',
	card: '#FBF8F1',
	clayStrong: '#8F4032',
	ink: '#28252B',
	secondary: '#EEE5D9',
};

const readTemplate = (templatePath: string) => readFileSync(join(templatesDirectory, templatePath), 'utf8');

const renderEmail = (templateName: string) => {
	const handlebars = Handlebars.create();
	handlebars.registerPartial('layout', readTemplate('partials/layout.hbs'));
	handlebars.registerPartial('button', readTemplate('partials/button.hbs'));
	handlebars.registerPartial('code-block', readTemplate('partials/code-block.hbs'));

	return handlebars.compile(readTemplate(`${templateName}.hbs`), {strict: true})({
		code: '123456',
		email: 'account@example.com',
		expiration: '10 minutes',
		name: 'Account User',
		resetUrl: 'https://tempo.example/reset-password',
		verificationUrl: 'https://tempo.example/verify-email',
	});
};

describe('email templates', () => {
	it.each(['welcome', 'reset-password', 'verify-new-email', 'account-deleted'])(
		'renders the %s email with the frontend design tokens',
		(templateName) => {
			const html = renderEmail(templateName);

			expect(html).toContain(`background-color: ${designTokens.background};`);
			expect(html).toContain(`background-color: ${designTokens.card};`);
			expect(html).toContain(`border: 1px solid ${designTokens.border};`);
			expect(html).toContain(`color: ${designTokens.ink};`);
			expect(html).toContain(`font-family: ${fontStack};`);
			expect(html).toContain('border-radius: 0;');
		},
	);

	it('renders primary buttons with the light-theme primary token', () => {
		const html = renderEmail('welcome');

		expect(html).toContain(`background-color: ${designTokens.clayStrong};`);
		expect(html).toContain(`color: ${designTokens.background};`);
		expect(html).toContain('padding: 8px 16px;');
		expect(html).toContain('font-weight: 500;');
		expect(html).not.toContain('hsl(240, 60%, 60%)');
	});

	it('renders verification codes as a flat secondary surface', () => {
		const html = renderEmail('welcome');

		expect(html).toContain(`background-color: ${designTokens.secondary};`);
		expect(html).toContain(`border: 1px solid ${designTokens.border};`);
		expect(html).toContain(`color: ${designTokens.ink};`);
		expect(html).toContain('box-shadow: none;');
	});
});
