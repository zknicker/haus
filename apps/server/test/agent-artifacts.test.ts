import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { artifactPublishResultSchema } from '@haus/api';
import type { ArtifactStorage } from '../src/artifacts/storage.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const objects = new Map<string, Uint8Array>();
const storage: ArtifactStorage = {
    delete: (key) => {
        objects.delete(key);
        return Promise.resolve();
    },
    downloadUrl: (key) => `https://r2.test/${key}?temporary-signature=secret`,
    upload: async (key, stream) => {
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        objects.set(key, bytes);
        return { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
    },
};
const fixture = agentCreationFixture(undefined, storage);

test('raw CLI publication streams through runner auth and other Agents can publish revisions', async () => {
    const firstRunner = await fixture.mintRunner('run_artifact_author');
    const secondRunner = await fixture.mintRunner('run_artifact_peer', fixture.peerAgentId);
    const first = await publish(
        firstRunner.token,
        { name: 'shared-report', request_id: 'raw-first-publish' },
        'first bytes'
    );
    expect(first.status).toBe(200);
    const published = artifactPublishResultSchema.parse(await first.json()).artifact;
    expect(new URL(published.stable_url).origin).toBe(fixture.harness.appOrigin);
    const second = await publish(
        secondRunner.token,
        { artifact_id: published.artifact_id, request_id: 'raw-second-publish' },
        'second bytes'
    );
    expect(second.status).toBe(200);
    const revision = artifactPublishResultSchema.parse(await second.json()).artifact;
    expect(revision.artifact_id).toBe(published.artifact_id);
    expect(revision.revision_number).toBe(2);
    const query = await fetch(
        new URL(
            `/api/agent/artifacts/${published.artifact_id}/download?revision_id=${published.revision_id}`,
            fixture.harness.url
        ),
        { headers: { authorization: `Bearer ${secondRunner.token}` } }
    );
    expect(query.status).toBe(200);
    expect(await query.json()).toMatchObject({
        artifact: { revision_id: published.revision_id },
        download_url: expect.stringContaining('https://r2.test/'),
    });
    const peerDelete = await fetch(
        new URL(`/api/agent/artifacts/${published.artifact_id}/delete`, fixture.harness.url),
        { method: 'POST', headers: { authorization: `Bearer ${secondRunner.token}` } }
    );
    expect(peerDelete.status).toBe(403);
    const historicalDelete = await fetch(
        new URL(
            `/api/agent/artifacts/${published.artifact_id}/versions/${published.revision_id}/delete`,
            fixture.harness.url
        ),
        { method: 'POST', headers: { authorization: `Bearer ${firstRunner.token}` } }
    );
    expect(historicalDelete.status).toBe(200);
    const currentDelete = await fetch(
        new URL(
            `/api/agent/artifacts/${published.artifact_id}/versions/${revision.revision_id}/delete`,
            fixture.harness.url
        ),
        { method: 'POST', headers: { authorization: `Bearer ${firstRunner.token}` } }
    );
    expect(currentDelete.status).toBe(409);
});

test('raw publishing rejects missing auth and retired Agents', async () => {
    expect(
        (await publish('invalid', { name: 'invalid', request_id: 'raw-invalid-auth' }, 'bytes'))
            .status
    ).toBe(401);
    const runner = await fixture.mintRunner('run_artifact_retired', fixture.peerAgentId);
    await fixture.harness
        .sql`update agents set retired_at = now() where id = ${fixture.peerAgentId}`;
    expect(
        (await publish(runner.token, { name: 'retired', request_id: 'raw-retired-auth' }, 'bytes'))
            .status
    ).toBe(403);
});

test('Raft action names publish without a nonce and read the same native artifacts', async () => {
    const runner = await fixture.mintRunner('run_artifact_actions');
    const url = new URL('/api/agent/actions/publish-artifact-raw', fixture.harness.url);
    url.search = new URLSearchParams({
        name: 'raft-actions',
        title: 'Raft actions',
        filename: 'bytes.bin',
        content_type: 'application/octet-stream',
    }).toString();
    const response = await fetch(url, {
        body: Uint8Array.of(0, 255, 128),
        headers: {
            authorization: `Bearer ${runner.token}`,
            'content-type': 'application/octet-stream',
        },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    const published = artifactPublishResultSchema.parse(await response.json()).artifact;
    const action = (name: string, input: object) =>
        fetch(new URL(`/api/agent/actions/${name}`, fixture.harness.url), {
            body: JSON.stringify(input),
            headers: {
                authorization: `Bearer ${runner.token}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });
    const get = await action('get-artifact', { artifact_id: published.artifact_id });
    expect(artifactPublishResultSchema.parse(await get.json()).artifact.revision_id).toBe(
        published.revision_id
    );
    expect((await action('list-artifacts', { offset: 0 })).status).toBe(200);
    expect(
        (await action('list-artifact-versions', { artifact_id: published.artifact_id, offset: 0 }))
            .status
    ).toBe(200);
    expect(
        (
            await action('delete-artifact-version', {
                artifact_id: published.artifact_id,
                revision_id: published.revision_id,
            })
        ).status
    ).toBe(409);
    expect((await action('delete-artifact', { artifact_id: published.artifact_id })).status).toBe(
        200
    );
});

function publish(token: string, metadata: Record<string, string>, body: string) {
    const url = new URL('/api/agent/artifacts/publish-artifact-raw', fixture.harness.url);
    url.search = new URLSearchParams({
        ...metadata,
        filename: 'report.txt',
        title: 'Shared report',
        content_type: 'text/plain',
    }).toString();
    return fetch(url, {
        body: new TextEncoder().encode(body),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        method: 'POST',
    });
}
