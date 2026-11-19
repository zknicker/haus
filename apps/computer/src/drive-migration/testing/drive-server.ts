import { createHash } from 'node:crypto';
import type { ArtifactMetadata } from '@haus/api';

export function createDriveRoutes(input: {
    agentId: string;
    refuse?: (path: string) => boolean;
    runnerToken: string;
}) {
    const heads = new Map<string, ArtifactMetadata>();
    const byRequest = new Map<string, ArtifactMetadata>();
    const bytes = new Map<string, Uint8Array>();
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
        if (input.refuse?.(path)) {
            return Response.json(
                { code: 'FORBIDDEN', message: `Writing ${path} is not allowed.` },
                { status: 403 }
            );
        }
        const replayed = byRequest.get(requestId);
        if (replayed) {
            return Response.json({ artifact: replayed });
        }
        const head = heads.get(path);
        if (head && !url.searchParams.get('base_revision_id')) {
            return Response.json(
                { code: 'REVISION_CONFLICT', current: head, message: `${path} already exists.` },
                { status: 409 }
            );
        }
        const artifact = commit(
            path,
            body,
            url.searchParams.get('content_type') ?? 'application/octet-stream'
        );
        byRequest.set(requestId, artifact);
        return Response.json({ artifact });
    };

    return {
        bytes,
        handle,
        heads,
        put: (path: string, text: string) =>
            commit(path, new TextEncoder().encode(text), 'text/markdown'),
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
