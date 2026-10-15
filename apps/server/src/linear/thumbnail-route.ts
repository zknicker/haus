import type { FastifyInstance, FastifyReply } from 'fastify';
import { isLinearAssetUrl, verifyLinearThumbnailToken } from './thumbnail-token.ts';

// `GET /api/linear/thumbnail/:token` (specs/linear-app.md#signed-urls): the
// issue chip's image, fetched from `uploads.linear.app` with the connection's
// workspace token, because Linear assets need auth. No redirects, a bounded
// time and size, and only image types pass through.

export const linearThumbnailRoute = '/api/linear/thumbnail/:token';
const timeoutMs = 10_000;
export const linearThumbnailMaxBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

export function linearThumbnailPath(token: string) {
    return `/api/linear/thumbnail/${encodeURIComponent(token)}`;
}

export interface LinearThumbnailDeps {
    /** The live workspace token behind an `active` connection, or null. */
    connectionAccessToken: (connectionId: string) => Promise<string | null>;
    now?: () => number;
    signingKey: string | null;
    transport: typeof fetch;
}

export type LinearThumbnailResult =
    | { body: Uint8Array; contentType: string; status: 200 }
    | { status: 404 | 502 };

export function registerLinearThumbnailRoute(app: FastifyInstance, deps: LinearThumbnailDeps) {
    app.get<{ Params: { token: string } }>(linearThumbnailRoute, async (request, reply) => {
        const result = await proxyLinearThumbnail(deps, request.params.token);
        return sendThumbnail(reply, result);
    });
}

/** Every refusal is a bare 404 or 502: nothing upstream reaches the client. */
export async function proxyLinearThumbnail(
    deps: LinearThumbnailDeps,
    token: string
): Promise<LinearThumbnailResult> {
    const claim = deps.signingKey
        ? verifyLinearThumbnailToken(deps.signingKey, token, deps.now?.() ?? Date.now())
        : null;
    if (!(claim && isLinearAssetUrl(claim.assetUrl))) {
        return { status: 404 };
    }
    const accessToken = await deps.connectionAccessToken(claim.connectionId);
    if (!accessToken) {
        return { status: 404 };
    }
    let response: Response;
    try {
        response = await deps.transport(claim.assetUrl, {
            headers: { authorization: `Bearer ${accessToken}` },
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch {
        return { status: 502 };
    }
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (!(response.ok && contentType && allowedTypes.has(contentType) && response.body)) {
        await response.body?.cancel().catch(() => undefined);
        return { status: 502 };
    }
    const body = await readBounded(response.body, linearThumbnailMaxBytes);
    return body ? { body, contentType, status: 200 } : { status: 502 };
}

function sendThumbnail(reply: FastifyReply, result: LinearThumbnailResult) {
    if (result.status !== 200) {
        return reply.code(result.status).header('cache-control', 'no-store').send();
    }
    return reply
        .code(200)
        .header('cache-control', 'private, max-age=300')
        .header('content-type', result.contentType)
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(result.body));
}

/** Stops reading past the limit, so an oversized asset costs at most the limit. */
async function readBounded(
    stream: ReadableStream<Uint8Array>,
    limit: number
): Promise<Uint8Array | null> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            total += value.byteLength;
            if (total > limit) {
                await reader.cancel();
                return null;
            }
            chunks.push(value);
        }
    } catch {
        return null;
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}
