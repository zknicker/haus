import dns from 'node:dns';
import net from 'node:net';
import { isBlockedNetworkAddress } from './network-guard.ts';

export const BLOCKED_MESSAGE =
    "This address isn't allowed: it points to a private or local network.";
export const SCHEME_MESSAGE = 'Remote MCP and OAuth URLs must use HTTPS.';

export interface SafeFetchOptions {
    allowPrivateNetworks: boolean;
}

export interface PinnedRequestTarget {
    hostHeader: string;
    tls?: { serverName: string };
    /** One pinned URL per validated address, in connection-attempt order. */
    urls: URL[];
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxHops = 5;

// Errors that mean the socket never connected, so nothing was sent and the
// next validated address is safe to try. Anything else (an HTTP response,
// a TLS/certificate failure, a reset mid-request, the caller's own abort)
// is surfaced as-is. The first set is what Bun's fetch reports; the second
// is older Bun's spelling of the same failures.
const CONNECT_FAILURE_CODES = new Set([
    'EADDRNOTAVAIL',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ETIMEDOUT',
    'ConnectionRefused',
    'FailedToOpenSocket',
]);

// Native fetch/XHR redirect handling strips Authorization on a cross-origin
// hop; this module's manual redirect loop must too, but it is a generic
// primitive shared by MCP, OAuth, and icon fetches with no way to know by
// name which caller-supplied header carries a secret, so anything not on
// this allowlist is presumed sensitive and dropped instead.
const SAFE_CROSS_ORIGIN_HEADERS = new Set([
    'accept',
    'accept-encoding',
    'accept-language',
    'content-length',
    'content-type',
    'user-agent',
]);

export async function resolveConnectAddresses(hostname: string): Promise<string[]> {
    if (net.isIP(hostname)) {
        return [hostname];
    }
    try {
        const records = await dns.promises.lookup(hostname, { all: true });
        return records.map((record) => record.address);
    } catch {
        return [];
    }
}

export async function assertAllowedFetchTarget(
    url: URL,
    label: string,
    options: SafeFetchOptions
): Promise<string[]> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`${label}: ${SCHEME_MESSAGE}`);
    }
    if (url.protocol === 'http:' && !options.allowPrivateNetworks) {
        throw new Error(`${label}: ${SCHEME_MESSAGE}`);
    }
    if (url.username || url.password) {
        throw new Error(`${label}: ${BLOCKED_MESSAGE}`);
    }
    const addresses = await resolveConnectAddresses(stripBrackets(url.hostname));
    if (
        addresses.length === 0 ||
        (!options.allowPrivateNetworks && addresses.some(isBlockedNetworkAddress))
    ) {
        throw new Error(`${label}: ${BLOCKED_MESSAGE}`);
    }
    return addresses;
}

export async function buildPinnedRequestTarget(
    url: URL,
    label: string,
    options: SafeFetchOptions
): Promise<PinnedRequestTarget> {
    const addresses = await assertAllowedFetchTarget(url, label, options);
    // IPv4 first: hosts without an IPv6 route fail fast on a v6 address, but
    // trying v4 first means the common case never pays for that attempt.
    const ordered = [
        ...addresses.filter((address) => net.isIP(address) !== 6),
        ...addresses.filter((address) => net.isIP(address) === 6),
    ];
    return {
        hostHeader: url.host,
        urls: ordered.map((address) => pinnedUrl(url, address)),
        ...(url.protocol === 'https:' ? { tls: { serverName: stripBrackets(url.hostname) } } : {}),
    };
}

export async function safeFetch(
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1] | undefined,
    label: string,
    options: SafeFetchOptions
): Promise<Response> {
    let { requestInit, url } = normalizeInput(input, init);
    for (let hop = 0; hop < maxHops; hop += 1) {
        const target = await buildPinnedRequestTarget(url, label, options);
        const headers = new Headers(requestInit.headers);
        headers.set('Host', target.hostHeader);
        const callerTls = (requestInit as { tls?: { serverName: string } }).tls;
        const response = await fetchFirstReachable(target.urls, {
            ...requestInit,
            headers,
            redirect: 'manual',
            // serverName wins over any caller-supplied tls options: it is what
            // makes the connection pin safe, not optional caller input.
            ...(target.tls || callerTls ? { tls: { ...callerTls, ...target.tls } } : {}),
        });
        if (!redirectStatuses.has(response.status)) {
            return response;
        }
        const location = response.headers.get('location');
        if (!location) {
            return response;
        }
        await response.body?.cancel();
        const redirectUrl = new URL(location, url);
        const crossOrigin = !isSameOrigin(url, redirectUrl);
        requestInit = nextRequestInit(requestInit, response.status, crossOrigin);
        url = redirectUrl;
    }
    throw new Error('Too many redirects');
}

async function fetchFirstReachable(urls: URL[], init: RequestInit): Promise<Response> {
    // A stream body may be partly consumed by a failed attempt, so it gets
    // exactly one; string and URLSearchParams bodies (what MCP and OAuth
    // send) are safe to replay because a connect failure sent nothing.
    const canRetry = !(init.body instanceof ReadableStream);
    for (const [index, url] of urls.entries()) {
        try {
            return await globalThis.fetch(url, init);
        } catch (error) {
            if (!canRetry || index === urls.length - 1 || !isConnectFailure(error)) {
                throw error;
            }
        }
    }
    throw new Error('No addresses to connect to');
}

function isConnectFailure(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' && CONNECT_FAILURE_CODES.has(code);
}

function pinnedUrl(url: URL, address: string): URL {
    const pinned = new URL(url.toString());
    // The WHATWG URL setter silently drops a bare (unbracketed) IPv6 literal,
    // so the resolved address has to be bracketed by hand before assignment.
    pinned.hostname = net.isIP(address) === 6 ? `[${address}]` : address;
    return pinned;
}

function normalizeInput(
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1] | undefined
): { requestInit: RequestInit; url: URL } {
    if (input instanceof Request) {
        return {
            requestInit: {
                body: input.body,
                headers: input.headers,
                method: input.method,
                ...init,
            },
            url: new URL(input.url),
        };
    }
    return { requestInit: { ...init }, url: new URL(input.toString()) };
}

// Replicates the WHATWG fetch redirect-method rule: 303 always demotes to
// GET, as does 301/302 when the current method is not already GET/HEAD;
// 307/308 (and 301/302 already on GET/HEAD) keep method, body and headers.
function nextRequestInit(
    requestInit: RequestInit,
    status: number,
    crossOrigin: boolean
): RequestInit {
    const method = (requestInit.method ?? 'GET').toUpperCase();
    const isGetOrHead = method === 'GET' || method === 'HEAD';
    const demoteToGet = status === 303 || (!isGetOrHead && (status === 301 || status === 302));
    let next = requestInit;
    if (demoteToGet) {
        const headers = new Headers(requestInit.headers);
        headers.delete('content-length');
        headers.delete('content-type');
        next = { ...requestInit, body: undefined, headers, method: 'GET' };
    }
    if (!crossOrigin) {
        return next;
    }
    return { ...next, headers: stripCrossOriginHeaders(new Headers(next.headers)) };
}

function isSameOrigin(a: URL, b: URL): boolean {
    return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port;
}

function stripCrossOriginHeaders(headers: Headers): Headers {
    const safe = new Headers();
    for (const [name, value] of headers) {
        if (SAFE_CROSS_ORIGIN_HEADERS.has(name.toLowerCase())) {
            safe.set(name, value);
        }
    }
    return safe;
}

function stripBrackets(hostname: string): string {
    return hostname.replace(/^\[|\]$/g, '');
}
