export type MailHogResponse = {
	total: number;
	count: number;
	start: number;
	items: MailHogMessage[];
};

type MailHogMessage = {
	ID: string;
	To: {Mailbox: string; Domain: string; Params: any}[];
	Content: {
		Headers: {
			Subject: string[];
			[key: string]: any;
		};
		Body: string;
		[key: string]: any;
	};
};
