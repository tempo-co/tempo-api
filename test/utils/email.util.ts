import axios from 'axios';

import {MailHogResponse} from '../types/mailhog-response';
import {SIX_DIGIT_REGEX, UUID_REGEX} from '../types/regex.constants';

export async function clearEmails(apiUrl: string) {
	await axios.delete(`${apiUrl}/api/v1/messages`);
}

export async function findEmailByRecipient(recipientEmail: string, apiUrl: string) {
	let retries = 5;
	const delayMs = 50;

	// Retry briefly to allow BullMQ to process the job and send email to MailHog
	while (retries > 0) {
		const response = await axios.get<MailHogResponse>(`${apiUrl}/api/v2/messages`);
		const email = response.data?.items?.find((msg) =>
			msg.To?.some((recipient) => recipient.Mailbox + '@' + recipient.Domain === recipientEmail),
		);

		if (email) return email;

		retries--;
		if (retries > 0) await sleep(delayMs);
	}
}

export function extractVerificationCode(body?: string) {
	if (!body) return null;
	const pattern = new RegExp(`following code:\\s*${SIX_DIGIT_REGEX.source}`, 'i');
	const match = body.match(pattern);
	return match ? match[1] : null;
}

export function extractPasswordResetToken(body?: string) {
	if (!body) return null;

	// First, decode the quoted-printable encoding. Replaces =3D with =
	let decodedBody = body.replace(/=3D/g, '=');
	// Handle line breaks with = at the end
	decodedBody = decodedBody.replace(/=\r?\n/g, '');

	const pattern = new RegExp(`reset-password\\?token=${UUID_REGEX.source}`);
	const match = decodedBody.match(pattern);
	if (match) {
		const uuidMatch = match[0].match(UUID_REGEX);
		return uuidMatch ? uuidMatch[0] : null;
	}
	return null;
}

export function sleep(ms: number = 250) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
