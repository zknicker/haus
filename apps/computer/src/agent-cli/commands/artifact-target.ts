import { artifactPublishResultSchema } from '@haus/api';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { requireDrivePath } from './artifact-pull.ts';

const artifactId = /^art_[A-Za-z0-9_-]{6,}$/u;
const artifactLink = /\/artifacts\/(art_[A-Za-z0-9_-]{6,})(?:[/?#]|$)/u;

/**
 * Resolves what an agent pastes, an artifact id, a `/artifacts/<id>` link, or a drive path, to
 * the artifact id the id-addressed routes take.
 */
export async function resolveArtifactId(
    client: AgentApiRequester,
    raw: string | undefined
): Promise<string> {
    const value = raw?.trim() ?? '';
    if (value === '') {
        throw new AgentCliError('INVALID_ARG', 'Name a file: its id, link, or path in Files.');
    }
    const linked = artifactLink.exec(value)?.[1];
    if (linked) {
        return linked;
    }
    if (artifactId.test(value)) {
        return value;
    }
    const result = await client.request(
        '/api/agent/artifacts/by-path',
        artifactPublishResultSchema,
        {
            query: { path: requireDrivePath(value) },
        }
    );
    return result.artifact.artifact_id;
}

export function artifactRoute(id: string, suffix = ''): string {
    return `/api/agent/artifacts/${encodeURIComponent(id)}${suffix}`;
}
