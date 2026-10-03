export const secureMcpFetch = (async (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1]
) => {
    const value = input instanceof Request ? input.url : input.toString();
    assertSecureOrLoopbackUrl(value, 'MCP and OAuth request');
    const response = await globalThis.fetch(input, init);
    return isTokenRequest(init) ? await withOAuthErrorStatus(response) : response;
}) as typeof globalThis.fetch;

export function assertSecureOrLoopbackUrl(value: string, label: string) {
    const url = new URL(value);
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !loopback)) {
        throw new Error(`${label} must use HTTPS or loopback HTTP without user information.`);
    }
}

function isTokenRequest(init: Parameters<typeof globalThis.fetch>[1]): boolean {
    return init?.body instanceof URLSearchParams && init.body.has('grant_type');
}

/**
 * GitHub's token endpoint reports OAuth errors with HTTP 200. RFC 6749 §5.2 says
 * 400, and the MCP SDK only parses an error body on a non-2xx status, so a 200
 * error otherwise surfaces as an opaque schema failure.
 */
async function withOAuthErrorStatus(response: Response): Promise<Response> {
    if (!response.ok) {
        return response;
    }
    const body = await response.text();
    const restored = () =>
        new Response(body, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText,
        });
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return restored();
    }
    if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'error' in parsed &&
        !('access_token' in parsed)
    ) {
        return new Response(body, { headers: response.headers, status: 400 });
    }
    return restored();
}
