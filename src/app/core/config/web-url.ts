export function createWebUrl(path: string, baseUrl: string): string {
	const base = new URL(baseUrl);
	base.pathname = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;

	return new URL(path.replace(/^\/+/, ''), base).toString();
}
