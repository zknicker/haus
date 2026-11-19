import { createHash } from 'node:crypto';

interface ReceivedUpload {
    authorization: string | null;
    bytes: Uint8Array;
    contentType: string | null;
    invocationId: string;
}

export function serveInvocationPayloads() {
    const uploads: ReceivedUpload[] = [];
    const downloads: { authorization: string | null; path: string }[] = [];
    const attachments = new Map<string, Uint8Array>();
    const hold = {
        arrived: Promise.withResolvers<void>(),
        enabled: false,
        release: Promise.withResolvers<void>(),
        requests: [] as string[],
    };
    const http = Bun.serve({
        port: 0,
        fetch: async (request) => {
            const url = new URL(request.url);
            if (hold.enabled) {
                hold.requests.push(`${request.method} ${url.pathname}`);
                hold.arrived.resolve();
                await hold.release.promise;
                return new Response('Released', { status: 503 });
            }
            const [, computer, invocations, invocationId, payloads, attachmentId] =
                url.pathname.split('/');
            if (
                computer !== 'computer' ||
                invocations !== 'invocations' ||
                payloads !== 'payloads' ||
                !invocationId
            ) {
                return new Response('Not found', { status: 404 });
            }
            const authorization = request.headers.get('authorization');
            if (request.method === 'PUT' && !attachmentId) {
                const bytes = new Uint8Array(await request.arrayBuffer());
                const contentType = request.headers.get('content-type');
                uploads.push({ authorization, bytes, contentType, invocationId });
                const id = `attachment-${uploads.length}`;
                attachments.set(id, bytes);
                return Response.json({
                    attachmentId: id,
                    mediaType: contentType,
                    sha256: digest(bytes),
                    sizeBytes: bytes.byteLength,
                });
            }
            if (request.method === 'GET' && attachmentId) {
                downloads.push({ authorization, path: url.pathname });
                const bytes = attachments.get(attachmentId);
                return bytes ? new Response(bytes) : new Response('Not found', { status: 404 });
            }
            return new Response('Method not allowed', { status: 405 });
        },
    });
    return {
        attachments,
        downloads,
        hold,
        http,
        stop: async () => {
            hold.release.resolve();
            await http.stop(true);
        },
        uploads,
    };
}

export function digest(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}
