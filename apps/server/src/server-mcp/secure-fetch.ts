import { isIP } from 'node:net';
import { env } from '../config/env.ts';
import { isBlockedNetworkAddress } from './network-guard.ts';
import { BLOCKED_MESSAGE, SCHEME_MESSAGE, safeFetch } from './safe-remote-fetch.ts';

const fetchOptions = { allowPrivateNetworks: env.HAUS_MCP_ALLOW_PRIVATE_NETWORKS };

export const secureMcpFetch = (async (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1]
) => {
    const response = await safeFetch(input, init, 'MCP and OAuth request', fetchOptions);
    return isTokenRequest(init) ? await withOAuthErrorStatus(response) : response;
}) as typeof globalThis.fetch;

export function assertSecureOrLoopbackUrl(
    value: string,
    label: string,
    options: { allowPrivateNetworks: boolean }
) {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`${label}: ${SCHEME_MESSAGE}`);
    }
    if (url.protocol === 'http:' && !options.allowPrivateNetworks) {
        throw new Error(`${label}: ${SCHEME_MESSAGE}`);
    }
    if (url.username || url.password) {
        throw new Error(`${label}: ${BLOCKED_MESSAGE}`);
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (!options.allowPrivateNetworks && isIP(hostname) && isBlockedNetworkAddress(hostname)) {
        throw new Error(`${label}: ${BLOCKED_MESSAGE}`);
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
