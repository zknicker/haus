const groundingRedirect =
    /^https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//u;
const maxResolved = 20;

export function isGroundingRedirect(url: string) {
    return groundingRedirect.test(url);
}

export async function resolveRedirects(urls: readonly string[], signal: AbortSignal | undefined) {
    const unique = [...new Set(urls)].slice(0, maxResolved);
    const settled = await Promise.allSettled(
        unique.map(async (url) => {
            const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal });
            const location = response.headers.get('location');
            const isRedirect = response.status >= 300 && response.status < 400;
            return { target: isRedirect && location ? new URL(location, url).href : null, url };
        })
    );
    signal?.throwIfAborted();
    const resolved = new Map<string, string>();
    for (const outcome of settled) {
        if (outcome.status === 'fulfilled' && outcome.value.target) {
            resolved.set(outcome.value.url, outcome.value.target);
        }
    }
    return resolved;
}
