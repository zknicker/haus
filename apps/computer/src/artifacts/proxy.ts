import { join } from 'node:path';
import { artifactDownloadResultSchema } from '@haus/api';
import { ArtifactCache } from './cache.ts';

export function createArtifactProxy(input: { dataRoot?: string; serverId?: string }) {
    const cache = input.dataRoot
        ? new ArtifactCache(join(input.dataRoot, 'shared-artifacts'))
        : null;
    return {
        release: () => cache?.release() ?? Promise.resolve(),
        async handle(
            request: Request,
            url: URL,
            authority: { serverOrigin: string; runnerToken: string }
        ) {
            try {
                return await handleArtifactRequest(request, url, authority, cache, input.serverId);
            } catch (error) {
                return Response.json(
                    {
                        code: 'ARTIFACT_TRANSFER_FAILED',
                        message:
                            error instanceof Error ? error.message : 'Artifact transfer failed.',
                    },
                    { status: 502 }
                );
            }
        },
    };
}

async function handleArtifactRequest(
    request: Request,
    url: URL,
    authority: { serverOrigin: string; runnerToken: string },
    cache: ArtifactCache | null,
    serverId: string | undefined
) {
    const view = /^\/api\/agent\/artifacts\/([^/]+)\/view$/u.exec(url.pathname);
    const publish =
        url.pathname === '/api/agent/artifacts/publish-artifact-raw' ||
        url.pathname === '/api/agent/actions/publish-artifact-raw';
    if (!(view || publish)) {
        return null;
    }
    const upstream = new URL(
        view ? `/api/agent/artifacts/${view[1]}/download` : url.pathname,
        authority.serverOrigin
    );
    upstream.search = url.search;
    if (publish && request.method === 'POST') {
        return forwardPublish(request, upstream, authority.runnerToken);
    }
    if (!(view && request.method === 'GET')) {
        return null;
    }
    if (!(cache && serverId)) {
        return Response.json(
            {
                code: 'ARTIFACT_CACHE_UNAVAILABLE',
                message: 'Computer shared cache is unavailable.',
            },
            { status: 503 }
        );
    }
    const response = await fetch(upstream, {
        headers: { authorization: `Bearer ${authority.runnerToken}` },
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
        return response;
    }
    const download = artifactDownloadResultSchema.parse(await response.json());
    const path = await cache.resolve({
        serverId,
        artifact: download.artifact,
        downloadUrl: download.download_url,
    });
    return Response.json({ artifact: download.artifact, path });
}

function forwardPublish(request: Request, upstream: URL, runnerToken: string) {
    const headers = new Headers({
        authorization: `Bearer ${runnerToken}`,
        'content-type': request.headers.get('content-type') ?? 'application/octet-stream',
    });
    const length = request.headers.get('content-length');
    if (length) {
        headers.set('content-length', length);
    }
    return fetch(upstream, { method: 'POST', body: request.body, headers, signal: request.signal });
}
