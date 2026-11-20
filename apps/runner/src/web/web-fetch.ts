import type { ToolOutcome } from '../run-context.ts';
import { contentKind, formatSize, pageText, truncateForModel } from './page-text.ts';
import { pinnedRequest } from './pinned-request.ts';
import {
    type AddressPolicy,
    isPublicAddress,
    type Resolve,
    resolveHost,
    vetHost,
} from './public-address.ts';

export const webFetchLimits = {
    maxBodyBytes: 5 * 1024 * 1024,
    maxRedirects: 5,
    timeoutMs: 30_000,
};

export type WebFetchLimits = typeof webFetchLimits;

export async function webFetch(input: {
    limits?: Partial<WebFetchLimits>;
    reachable?: AddressPolicy;
    resolve?: Resolve;
    signal: AbortSignal;
    url: string;
}) {
    const limits = { ...webFetchLimits, ...input.limits };
    const timeout = AbortSignal.timeout(limits.timeoutMs);
    const signal = AbortSignal.any([input.signal, timeout]);
    try {
        const fetched = await follow(input.url, {
            limits,
            reachable: input.reachable ?? isPublicAddress,
            resolve: input.resolve ?? resolveHost,
            signal,
        });
        return fetched.kind === 'refused'
            ? refused(fetched.text)
            : await render(input.url, fetched, limits);
    } catch (error) {
        input.signal.throwIfAborted();
        if (timeout.aborted) {
            return refused(
                `${input.url} did not finish within ${limits.timeoutMs / 1000} seconds, so web_fetch stopped.`
            );
        }
        return refused(`web_fetch could not fetch ${input.url}: ${messageOf(error)}`);
    }
}

async function follow(
    requested: string,
    options: {
        limits: WebFetchLimits;
        reachable: AddressPolicy;
        resolve: Resolve;
        signal: AbortSignal;
    }
) {
    let current = webUrlOf(requested);
    for (let hop = 0; ; hop += 1) {
        if (!current) {
            return { kind: 'refused', text: 'web_fetch reads only http and https URLs.' } as const;
        }
        const vetted = await vetHost(current.hostname, options.reachable, options.resolve);
        if (vetted.kind === 'blocked') {
            return {
                kind: 'refused',
                text: `${current.href} resolves to ${vetted.address}, a private or local address, so web_fetch did not fetch it.`,
            } as const;
        }
        const response = await pinnedRequest(current, vetted.address, {
            headers: { accept: acceptHeader },
            signal: options.signal,
        });
        const location = redirectStatuses.has(response.status)
            ? response.headers.get('location')
            : null;
        if (location === null) {
            return { kind: 'response', response, url: current.href } as const;
        }
        await response.body?.cancel();
        if (hop === options.limits.maxRedirects) {
            return {
                kind: 'refused',
                text: `${requested} redirected more than ${options.limits.maxRedirects} times, so web_fetch stopped.`,
            } as const;
        }
        current = webUrlOf(location, current);
    }
}

async function render(
    requested: string,
    fetched: { response: Response; url: string },
    limits: WebFetchLimits
) {
    const { response, url } = fetched;
    const contentType = response.headers.get('content-type');
    const header = [
        ...(url === requested ? [] : [`Redirected to ${url}.`]),
        ...(response.ok ? [] : [`The server answered HTTP ${response.status}.`]),
    ];
    if (contentKind(contentType) === 'binary') {
        await response.body?.cancel();
        return outcome([...header, describeBinary(url, contentType, contentLengthOf(response))], {
            isError: !response.ok,
        });
    }
    const body = await readCapped(response, limits.maxBodyBytes);
    const text = pageText({ bytes: body.bytes, contentType, url });
    if (text === null) {
        return outcome([...header, describeBinary(url, contentType, body.bytes.length)], {
            isError: !response.ok,
        });
    }
    const page = text.trim() === '' ? '(The page has no text.)' : truncateForModel(text);
    const cut = body.cut
        ? [
              `[The page is larger than ${formatSize(limits.maxBodyBytes)}; web_fetch read only its first ${formatSize(limits.maxBodyBytes)}.]`,
          ]
        : [];
    return outcome([...header, page, ...cut], { isError: !response.ok });
}

async function readCapped(response: Response, maxBytes: number) {
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (reader) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        if (total + value.length > maxBytes) {
            chunks.push(value.subarray(0, maxBytes - total));
            await reader.cancel();
            return { bytes: Buffer.concat(chunks), cut: true };
        }
        chunks.push(value);
        total += value.length;
    }
    return { bytes: Buffer.concat(chunks), cut: false };
}

function webUrlOf(raw: string, base?: URL) {
    const url = URL.parse(raw, base?.href);
    return url && (url.protocol === 'http:' || url.protocol === 'https:') ? url : null;
}

function describeBinary(url: string, contentType: string | null, bytes: number | null) {
    const size = bytes === null ? 'of unknown size' : formatSize(bytes);
    return `${url} is ${contentType ?? 'binary data'} (${size}), not text, so web_fetch shows none of it.`;
}

function contentLengthOf(response: Response) {
    const length = Number(response.headers.get('content-length'));
    return Number.isSafeInteger(length) && length >= 0 && response.headers.has('content-length')
        ? length
        : null;
}

function outcome(parts: readonly string[], options: { isError: boolean }) {
    return {
        content: [{ text: parts.join('\n\n'), type: 'text' }],
        isError: options.isError,
    } satisfies ToolOutcome;
}

function refused(text: string) {
    return outcome([text], { isError: true });
}

function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

const acceptHeader = 'text/html, text/markdown;q=0.9, text/plain;q=0.8, */*;q=0.5';

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
