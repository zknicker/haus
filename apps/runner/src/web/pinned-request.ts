import { type IncomingMessage, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

export function pinnedRequest(
    url: URL,
    address: string,
    init: { headers: Record<string, string>; signal: AbortSignal }
) {
    const family = isIP(address);
    const lookup: LookupFunction = (_hostname, options, callback) => {
        if (options.all) {
            callback(null, [{ address, family }]);
        } else {
            callback(null, address, family);
        }
    };
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise<Response>((resolve, reject) => {
        const outgoing = send(
            url,
            { headers: init.headers, lookup, signal: init.signal },
            (incoming) => {
                try {
                    resolve(responseOf(incoming));
                } catch (error) {
                    incoming.destroy();
                    reject(error);
                }
            }
        );
        outgoing.on('error', reject);
        outgoing.end();
    });
}

function responseOf(incoming: IncomingMessage) {
    const status = incoming.statusCode ?? 0;
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
        for (const one of Array.isArray(value) ? value : [value ?? '']) {
            headers.append(name, one);
        }
    }
    if (nullBodyStatuses.has(status)) {
        incoming.resume();
        return new Response(null, { headers, status });
    }
    return new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
        headers,
        status,
    });
}

const nullBodyStatuses = new Set([204, 205, 304]);
