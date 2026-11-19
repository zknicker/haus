import { parseArtifactPath } from '@haus/api';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { artifactPublishResultResponseSchema } from '../artifact-drive-response-schema.ts';

const artifactId = /^art_[A-Za-z0-9_-]{6,}$/u;
const artifactLink = /\/artifacts\/(art_[A-Za-z0-9_-]{6,})(?:[/?#]|$)/u;
const drivePrefix = /^(?:drive:\/\/|drive\/)/u;

/**
 * Resolves what an agent pastes, an artifact id, a `/artifacts/<id>` link, a `drive://` citation,
 * or a Drive path (with or without the local `drive/` folder prefix), to the artifact id the
 * id-addressed routes take.
 */
export async function resolveArtifactId(client: AgentApiRequester, raw: string | undefined) {
    const value = raw?.trim() ?? '';
    if (value === '') {
        throw new AgentCliError('INVALID_ARG', 'Name a file: its id, link, or path in Drive.');
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
        artifactPublishResultResponseSchema,
        { query: { path: requireDrivePath(value.replace(drivePrefix, '')) } }
    );
    return result.artifact.artifact_id;
}

export function artifactRoute(id: string, suffix = '') {
    return `/api/agent/artifacts/${encodeURIComponent(id)}${suffix}`;
}

function requireDrivePath(raw: string) {
    const parsed = parseArtifactPath(raw.replace(/\/+$/u, ''));
    if (!parsed.ok) {
        throw new AgentCliError(
            'INVALID_PATH',
            `${raw} is not a valid path in Drive: ${parsed.message}`
        );
    }
    return parsed.path;
}
