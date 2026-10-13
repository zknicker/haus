import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ArtifactMetadata, artifactPathIsInside, artifactPathKey } from '@haus/api';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ArtifactUploader, ArtifactUploadInput } from './artifact-upload.ts';

/**
 * In-memory drive for pull/push tests: compare-and-set writes, idempotent request ids, paged
 * recursive listing, and a view route that hands out cache files like the Computer proxy.
 */
export function createTestDrive(pageSize = 2) {
    const files = new Map<string, { artifact: ArtifactMetadata; bytes: Buffer }>();
    const requests = new Map<string, ArtifactMetadata>();
    const uploads: ArtifactUploadInput[] = [];
    const revisionOwners = new Map<string, string>();
    const cache = mkdtempSync(join(tmpdir(), 'haus-test-cache-'));
    let counter = 0;

    function put(path: string, content: string, author = 'agt_other'): ArtifactMetadata {
        const existing = [...files.values()].find(
            (file) => artifactPathKey(file.artifact.path) === artifactPathKey(path)
        );
        counter += 1;
        const bytes = Buffer.from(content);
        const artifactId = existing?.artifact.artifact_id ?? `art_test${counter}`;
        const artifact: ArtifactMetadata = {
            artifact_id: artifactId,
            content_type: 'text/plain',
            created_at: '2026-10-13T00:00:00.000Z',
            creator: { type: 'agent', agent_id: author },
            filename: path.slice(path.lastIndexOf('/') + 1),
            path,
            revision_id: `rev_${counter}`,
            revision_number: (existing?.artifact.revision_number ?? 0) + 1,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            size_bytes: bytes.length,
            stable_url: `https://haus.test/artifacts/${artifactId}`,
            title: path,
            updated_at: `2026-10-13T00:00:${String(counter).padStart(2, '0')}.000Z`,
            version_url: `https://haus.test/artifacts/${artifactId}?revision=rev_${counter}`,
        };
        if (existing) {
            files.delete(existing.artifact.path);
        }
        files.set(path, { artifact, bytes });
        return artifact;
    }

    const client: AgentApiRequester = {
        request: <T>(route: string, _schema: unknown, input: AgentApiRequest = {}) => {
            const query = input.query ?? {};
            if (route === '/api/agent/artifacts/by-path') {
                const found = files.get(String(query.path));
                if (!found) {
                    return Promise.reject(
                        new AgentCliError('NOT_FOUND', 'No artifact at that path.')
                    );
                }
                return Promise.resolve({ artifact: found.artifact } as T);
            }
            if (route === '/api/agent/artifacts') {
                const prefix = String(query.prefix ?? '');
                const all = [...files.values()]
                    .map((file) => file.artifact)
                    .filter((artifact) => artifactPathIsInside(artifact.path, prefix))
                    .sort((a, b) => a.path.localeCompare(b.path));
                const offset = Number(query.offset ?? 0);
                const page = all.slice(offset, offset + pageSize);
                const next = offset + pageSize < all.length ? offset + pageSize : null;
                return Promise.resolve({ artifacts: page, folders: [], next_offset: next } as T);
            }
            const view = /^\/api\/agent\/artifacts\/([^/]+)\/view$/u.exec(route);
            if (view) {
                const found = [...files.values()].find(
                    (file) => file.artifact.artifact_id === view[1]
                );
                if (!found) {
                    return Promise.reject(new AgentCliError('NOT_FOUND', 'No such artifact.'));
                }
                const cached = join(cache, `${found.artifact.revision_id}`);
                writeFileSync(cached, found.bytes, { mode: 0o444 });
                return Promise.resolve({ artifact: found.artifact, path: cached } as T);
            }
            return Promise.reject(new Error(`unexpected route ${route}`));
        },
    };

    const upload: ArtifactUploader = (input) => {
        uploads.push(input);
        const retried = requests.get(input.requestId);
        if (retried) {
            return Promise.resolve({ kind: 'published', artifact: retried });
        }
        const byBase = input.baseRevisionId
            ? [...files.values()].find(
                  (file) => file.artifact.artifact_id === artifactOf(input.baseRevisionId)
              )
            : undefined;
        const head = byBase ?? files.get(input.path);
        if (head && !input.replace && head.artifact.revision_id !== input.baseRevisionId) {
            return Promise.resolve({
                kind: 'conflict',
                current: head.artifact,
                message: 'moved on',
            });
        }
        if (head && byBase && head.artifact.path !== input.path) {
            return Promise.resolve({ kind: 'conflict', current: head.artifact, message: 'moved' });
        }
        const artifact = put(input.path, readFileSync(input.file, 'utf8'), 'agt_me');
        revisionOwners.set(artifact.revision_id, artifact.artifact_id);
        requests.set(input.requestId, artifact);
        return Promise.resolve({ kind: 'published', artifact });
    };
    const artifactOf = (revision: string | undefined) =>
        revision ? revisionOwners.get(revision) : undefined;
    const seed = (path: string, content: string) => {
        const artifact = put(path, content);
        revisionOwners.set(artifact.revision_id, artifact.artifact_id);
        return artifact;
    };
    const move = (from: string, to: string) => {
        const found = files.get(from);
        if (found) {
            files.delete(from);
            found.artifact = {
                ...found.artifact,
                path: to,
                filename: to.slice(to.lastIndexOf('/') + 1),
            };
            files.set(to, found);
        }
    };
    const remove = (path: string) => files.delete(path);
    const text = (path: string) => files.get(path)?.bytes.toString();
    return { client, upload, uploads, seed, move, remove, text, files };
}
