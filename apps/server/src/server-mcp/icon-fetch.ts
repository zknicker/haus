import type { McpIconFetch } from './icon-loader.ts';

export const iconRequestInit = { redirect: 'manual' } as const satisfies RequestInit;

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxRedirects = 3;

/** Follow canonical website redirects without letting the site choose another host. */
export async function fetchMcpIcon(
    fetchImpl: McpIconFetch,
    initialUrl: string,
    signal: AbortSignal
): Promise<{ response: Response; url: string }> {
    const initial = new URL(initialUrl);
    let url = initial;
    for (let hops = 0; ; hops += 1) {
        const response = await fetchImpl(url.toString(), signal);
        if (!redirectStatuses.has(response.status)) {
            return { response, url: url.toString() };
        }
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || hops >= maxRedirects) {
            return { response, url: url.toString() };
        }
        const next = new URL(location, url);
        if (!isCanonicalIconUrl(initial, next)) {
            return { response, url: url.toString() };
        }
        url = next;
    }
}

function isCanonicalIconUrl(initial: URL, next: URL): boolean {
    return (
        next.protocol === 'https:' &&
        next.username === '' &&
        next.password === '' &&
        next.port === initial.port &&
        (next.hostname === initial.hostname ||
            next.hostname === `www.${initial.hostname}` ||
            (initial.hostname.startsWith('www.') && next.hostname === initial.hostname.slice(4)))
    );
}
