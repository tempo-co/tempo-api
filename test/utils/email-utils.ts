import ms from 'ms';

import {Account} from '@modules/account/account.entity';

import {MailpitMessageSummaryResponse, MailpitResponse} from '../types/mailpit';
import {SIX_DIGIT_REGEX, UUID_REGEX} from '../types/regex.constants';

export class EmailUtils {
	static async clearEmails(apiUrl: string) {
		await fetch(`${apiUrl}/api/v1/messages`, {method: 'DELETE'});
	}

	static async findEmailByRecipient(recipientEmail: string, apiUrl: string, subject?: string) {
		let retries = 10;
		const delayMs = 200;

		// retry briefly to allow BullMQ to process the job and send email to Mailpit
		while (retries > 0) {
			const res = await fetch(`${apiUrl}/api/v1/messages`);
			const data: MailpitResponse = await res.json();
			const email = data.messages.find((msg) => {
				const isRecipient = msg.To.some((r) => r.Address.toLowerCase() === recipientEmail.toLowerCase());
				return isRecipient && (!subject || msg.Subject === subject);
			});

			if (email) {
				const res = await fetch(`${apiUrl}/api/v1/message/${email.ID}`);
				const fullEmail: MailpitMessageSummaryResponse = await res.json();
				return fullEmail;
			}

			retries--;
			if (retries > 0) await this._sleep(delayMs);
		}
	}

	static extractCode(body?: string) {
		if (!body) return '';
		const pattern = new RegExp(`You can also manually enter the code below.?\\s*(${SIX_DIGIT_REGEX.source})`, 'i');
		const match = body.match(pattern);
		return match ? match[1] : '';
	}

	static extractToken(body?: string): string {
		if (!body) return '';
		// decode the quoted-printable encoding and handle soft line breaks
		const decodedBody = body.replace(/=3D/g, '=').replace(/=\r?\n/g, '');

		const pattern = new RegExp(`[?&]token=(${UUID_REGEX.source})`, 'i');
		const match = decodedBody.match(pattern);
		return match ? match[1] : '';
	}

	static normalizeEmailText(text?: string) {
		if (!text) return '';
		// remove all asterisk characters
		let cleaned = text.replace(/\*/g, '');
		// normalize all newline types
		cleaned = cleaned.replace(/\r\n/g, '\n');
		// remove all blank lines
		cleaned = cleaned.replace(/\n+/g, '\n');
		return cleaned.trim();
	}

	static getWelcomeEmailBody(
		email: Account['email'],
		name: Account['name'],
		webUrl: string,
		code: string,
		expiration: string,
	) {
		const ex = ms(ms(expiration as ms.StringValue), {long: true});

		return `Welcome to Tempo, ${name}.
Please confirm your email address by clicking the button below.
Verify email ( ${webUrl}/verify-email?email=${encodeURIComponent(email)}&code=${code} )
This link and code expire in ${ex}. You can also manually enter the code below.
${code}
If you did not sign up for Tempo, please disregard this email.`;
	}

	static getPasswordResetEmailBody(email: Account['email'], webUrl: string, token: string, expiration: string) {
		const ex = ms(ms(expiration as ms.StringValue), {long: true});

		return `Reset your Tempo password
You requested a password reset for your Tempo account. Click the button below to proceed and set a new password.
Reset password ( ${webUrl}/reset-password?email=${encodeURIComponent(email)}&token=${token} )
This link will expire in ${ex}.
If you did not request this, please disregard this email.`;
	}

	static getVerifyNewEmailBody(email: Account['email'], webUrl: string, token: string, expiration: string) {
		const ex = ms(ms(expiration as ms.StringValue), {long: true});

		return `Verify your new email with Tempo
You requested to change the the email address associated with your Tempo account. Please confirm this change by clicking the button below.
Verify email ( ${webUrl}/verify-email-change?email=${encodeURIComponent(email)}&token=${token} )
This link will expire in ${ex}.
If you did not request this, please disregard this email.`;
	}

	private static _sleep(ms: number = 250) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
