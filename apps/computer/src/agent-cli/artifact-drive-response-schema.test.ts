import { expect, test } from 'bun:test';

import { artifactPublishResultSchema } from '@haus/api';

import {
    artifactDownloadResultResponseSchema,
    artifactListResultResponseSchema,
    artifactMoveResultResponseSchema,
    artifactVersionsResultResponseSchema,
} from './artifact-drive-response-schema.ts';

/**
 * A current Server's artifact metadata, plus a field a future Server release
 * might additively send at every nesting level: the metadata itself and its
 * `creator`.
 */
const artifactWithUnknownFields = {
    artifact_id: 'art_1234567890',
    content_type: 'text/html',
    created_at: '2026-09-04T12:00:00.000Z',
    creator: { agent_id: 'agt_orbit', futureCreatorField: true, type: 'agent' },
    filename: 'report.html',
    futureArtifactField: 'a field this Computer build predates',
    path: 'reports/report.html',
    revision_id: 'arv_1234567890',
    revision_number: 1,
    sha256: 'a'.repeat(64),
    size_bytes: 128,
    stable_url: 'https://example.com/report.html',
    title: 'Report',
    updated_at: '2026-09-04T12:00:00.000Z',
    version_url: 'https://example.com/report.html?v=1',
};

test('the canonical strict artifact publish result schema rejects a field it does not know', () => {
    expect(() =>
        artifactPublishResultSchema.parse({ artifact: artifactWithUnknownFields })
    ).toThrow(/futureArtifactField/);
});

test('the Computer response schema parses artifact metadata carrying fields from a newer Server, at every nesting level', () => {
    const parsed = artifactDownloadResultResponseSchema.parse({
        artifact: artifactWithUnknownFields,
        download_url: 'https://example.com/download',
        expires_at: '2026-09-04T12:10:00.000Z',
    });
    expect(parsed.artifact.artifact_id).toBe('art_1234567890');
    expect(parsed.artifact.creator).toEqual({
        agent_id: 'agt_orbit',
        futureCreatorField: true,
        type: 'agent',
    });
});

test('the Computer response schema tolerates an unknown field on a drive listing', () => {
    const payload = {
        artifacts: [artifactWithUnknownFields],
        folders: [
            {
                file_count: 2,
                futureFolderField: true,
                name: 'reports',
                path: 'reports',
                updated_at: '2026-09-04T12:00:00.000Z',
            },
        ],
        futureListField: true,
        next_offset: null,
        summary: { files: 1, files_in_folders: 2, folders: 1, futureSummaryField: true },
    };
    const parsed = artifactListResultResponseSchema.parse(payload);
    expect(parsed.artifacts).toHaveLength(1);
    expect(parsed.folders).toHaveLength(1);
});

test('the Computer response schema tolerates an unknown field on a versions result', () => {
    const payload = { futureVersionsField: true, versions: [artifactWithUnknownFields] };
    expect(artifactVersionsResultResponseSchema.parse(payload).versions).toHaveLength(1);
});

test('the Computer response schema tolerates an unknown field on a move result', () => {
    const payload = {
        from: 'reports/old.html',
        futureMoveField: true,
        kind: 'file' as const,
        moved_count: 1,
        to: 'reports/new.html',
    };
    expect(artifactMoveResultResponseSchema.parse(payload).to).toBe('reports/new.html');
});
