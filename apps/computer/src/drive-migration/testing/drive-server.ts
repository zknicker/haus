import { createHash } from 'node:crypto';
import type { ArtifactMetadata } from '@haus/api';

export type DriveFault = 'failed-reservation' | 'lost-answer';

type Reservation = { artifact: ArtifactMetadata; state: 'ready' } | { state: 'failed' };

export function createDriveRoutes(input: {
    agentId: string;
    fault?: (path: string) => DriveFault | null;
    onUpload?: (path: string) => Promise<void>;
    refuse?: (path: string) => boolean;
    runnerToken: string;
}) {
    const heads = new Map<string, ArtifactMetadata>();
    const byRequest = new Map<string, Reservation>();
    const bytes = new Map<string, Uint8Array>();
    const deletedRevisions = new Set<string>();
    let revisions = 0;

    const commit = (path: string, body: Uint8Array, contentType: string) => {
        revisions += 1;
        const prior = heads.get(path);
        const now = new Date().toISOString();
        const artifact = {
            artifact_id: prior?.artifact_id ?? `art_${revisions}`,
            content_type: contentType,
            created_at: prior?.created_at ?? now,
            creator: { agent_id: input.agentId, type: 'agent' },
            filename: path.split('/').at(-1) ?? path,
            path,
            revision_id: `rev_${revisions}`,
            revision_number: (prior?.revision_number ?? 0) + 1,
            sha256: createHash('sha256').update(body).digest('hex'),
            size_bytes: body.byteLength,
            stable_url: `https://haus.test/a/${revisions}`,
            title: path.split('/').at(-1) ?? path,
            updated_at: now,
            version_url: `https://haus.test/v/${revisions}`,
        } satisfies ArtifactMetadata;
        heads.set(path, artifact);
        bytes.set(path, body);
        return artifact;
    };

    const handle = async (request: Request) => {
        const url = new URL(request.url);
        if (url.pathname !== '/api/agent/artifacts/publish-artifact-raw') {
            return null;
        }
        if (request.headers.get('authorization') !== `Bearer ${input.runnerToken}`) {
            return Response.json({ code: 'UNAUTHORIZED', message: 'No runner.' }, { status: 401 });
        }
        const path = url.searchParams.get('path') ?? '';
        const requestId = url.searchParams.get('request_id') ?? '';
        const body = new Uint8Array(await request.arrayBuffer());
        await input.onUpload?.(path);
        if (input.refuse?.(path)) {
            return Response.json(
                { code: 'FORBIDDEN', message: `Writing ${path} is not allowed.` },
                { status: 403 }
            );
        }
        const replayed = byRequest.get(requestId);
        if (replayed?.state === 'failed') {
            return Response.json(
                { code: 'UPLOAD_CONFLICT', message: 'Use a new request_id after a failed upload.' },
                { status: 409 }
            );
        }
        if (replayed && deletedRevisions.has(replayed.artifact.revision_id)) {
            return Response.json(
                { code: 'DELETED', message: 'That revision was since deleted.' },
                { status: 409 }
            );
        }
        if (replayed) {
            return Response.json({ artifact: replayed.artifact });
        }
        const head = heads.get(path);
        if (head && !url.searchParams.get('base_revision_id')) {
            return Response.json(
                { code: 'REVISION_CONFLICT', current: head, message: `${path} already exists.` },
                { status: 409 }
            );
        }
        const fault = input.fault?.(path) ?? null;
        if (fault === 'failed-reservation') {
            byRequest.set(requestId, { state: 'failed' });
            return Response.json(
                { code: 'STORAGE_UNAVAILABLE', message: 'Storage did not take the bytes.' },
                { status: 503 }
            );
        }
        const artifact = commit(
            path,
            body,
            url.searchParams.get('content_type') ?? 'application/octet-stream'
        );
        byRequest.set(requestId, { artifact, state: 'ready' });
        if (fault === 'lost-answer') {
            return new Response('upstream reset', { status: 502 });
        }
        return Response.json({ artifact });
    };

    return {
        bytes,
        handle,
        heads,
        put: (path: string, text: string) =>
            commit(path, new TextEncoder().encode(text), 'text/markdown'),
        remove: (path: string) => {
            const head = heads.get(path);
            if (head) {
                deletedRevisions.add(head.revision_id);
            }
            heads.delete(path);
            bytes.delete(path);
        },
        revisionCount: () => revisions,
    };
}

export function serveDrive(routes: ReturnType<typeof createDriveRoutes>) {
    return Bun.serve({
        fetch: async (request) =>
            (await routes.handle(request)) ?? new Response('not found', { status: 404 }),
        hostname: '127.0.0.1',
        port: 0,
    });
}
