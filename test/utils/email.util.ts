import axios from 'axios';
import {MailHogResponse} from 'test/types/mailhog-response';

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

export function extractVerificationCode(body: string | undefined) {
	if (!body) return null;
	const match = body.match(/following code:\s*(\d{6})/i);
	return match ? match[1] : null;
}

export function sleep(ms: number = 250) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
