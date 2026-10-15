import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { artifactPublicLinkResultSchema, artifactPublishResultSchema } from '@haus/api';
import type { ArtifactStorage } from '../src/artifacts/storage.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const objects = new Map<string, Uint8Array>();
const storage: ArtifactStorage = {
    delete: (key) => {
        objects.delete(key);
        return Promise.resolve();
    },
    downloadUrl: (key) => `https://r2.test/${key}?temporary-signature=secret`,
    stream: () => new ReadableStream(),
    read: (key, maxBytes) =>
        Promise.resolve((objects.get(key) ?? new Uint8Array()).slice(0, maxBytes)),
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
        { path: 'shared/report.txt', request_id: 'raw-first-publish' },
        'first bytes'
    );
    expect(first.status).toBe(200);
    const published = artifactPublishResultSchema.parse(await first.json()).artifact;
    expect(new URL(published.stable_url).origin).toBe(fixture.harness.appOrigin);
    const second = await publish(
        secondRunner.token,
        {
            base_revision_id: published.revision_id,
            path: 'shared/report.txt',
            request_id: 'raw-second-publish',
        },
        'second bytes'
    );
    expect(second.status).toBe(200);
    const revision = artifactPublishResultSchema.parse(await second.json()).artifact;
    expect(revision.artifact_id).toBe(published.artifact_id);
    expect(revision.revision_number).toBe(2);
    const taken = await publish(
        secondRunner.token,
        { path: 'Shared/Report.txt', request_id: 'raw-taken-path' },
        'peer bytes'
    );
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({
        code: 'REVISION_CONFLICT',
        current: { path: 'shared/report.txt', revision_id: revision.revision_id },
    });
    const stale = await publish(
        secondRunner.token,
        {
            base_revision_id: published.revision_id,
            path: 'shared/report.txt',
            request_id: 'raw-stale-base',
        },
        'stale bytes'
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
        code: 'REVISION_CONFLICT',
        current: { revision_id: revision.revision_id },
    });
    const invalid = await publish(secondRunner.token, { path: '/shared/x.txt' }, 'bytes');
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: 'INVALID_PATH' });
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

test('Agent list narrows by query and by the calling Agent as creator', async () => {
    const author = await fixture.mintRunner('run_artifact_list_author');
    const peer = await fixture.mintRunner('run_artifact_list_peer', fixture.peerAgentId);
    expect((await publish(author.token, { path: 'quarterly-chart.txt' }, 'a')).status).toBe(200);
    expect((await publish(peer.token, { path: 'quarterly-notes.txt' }, 'b')).status).toBe(200);
    expect((await publish(peer.token, { path: 'roadmap-sketch.txt' }, 'c')).status).toBe(200);
    const names = async (token: string, search: string) => {
        const response = await fetch(
            new URL(`/api/agent/artifacts?${search}`, fixture.harness.url),
            {
                headers: { authorization: `Bearer ${token}` },
            }
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as { artifacts: { path: string }[] };
        return body.artifacts.map((artifact) => artifact.path.replace(/\.txt$/u, '')).sort();
    };

    expect(await names(peer.token, 'query=quarterly')).toEqual([
        'quarterly-chart',
        'quarterly-notes',
    ]);
    expect(await names(peer.token, 'query=quarterly&mine=true')).toEqual(['quarterly-notes']);
    expect(await names(author.token, 'mine=true&query=sketch')).toEqual([]);
    expect(await names(peer.token, 'mine=true&query=sketch')).toEqual(['roadmap-sketch']);
});

test('raw publishing rejects missing auth and retired Agents', async () => {
    expect(
        (await publish('invalid', { path: 'invalid.txt', request_id: 'raw-invalid-auth' }, 'bytes'))
            .status
    ).toBe(401);
    const runner = await fixture.mintRunner('run_artifact_retired', fixture.peerAgentId);
    await fixture.harness
        .sql`update agents set retired_at = now() where id = ${fixture.peerAgentId}`;
    expect(
        (
            await publish(
                runner.token,
                { path: 'retired.txt', request_id: 'raw-retired-auth' },
                'bytes'
            )
        ).status
    ).toBe(403);
});

test('Raft action names publish without a nonce and read the same native artifacts', async () => {
    const runner = await fixture.mintRunner('run_artifact_actions');
    const url = new URL('/api/agent/actions/publish-artifact-raw', fixture.harness.url);
    url.search = new URLSearchParams({
        path: 'raft/bytes.bin',
        title: 'Raft actions',
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

test('Agents share public links; only the link creator or an Owner/Admin disables one', async () => {
    const author = await fixture.mintRunner('run_public_link_author');
    // The peer Agent was retired above; Cove stands in as another Agent.
    const peer = await fixture.mintRunner('run_public_link_peer', fixture.coveAgentId);
    const created = await publish(author.token, { path: 'pod/design.txt' }, 'design');
    const { artifact_id } = artifactPublishResultSchema.parse(await created.json()).artifact;
    const route = (token: string, suffix = '') =>
        fetch(
            new URL(
                `/api/agent/artifacts/${artifact_id}/public-link${suffix}`,
                fixture.harness.url
            ),
            {
                headers: { authorization: `Bearer ${token}` },
                method: 'POST',
            }
        );
    const shared = artifactPublicLinkResultSchema.parse(await (await route(author.token)).json());
    expect(shared.link).toMatchObject({ can_disable: true, creator: { type: 'agent' } });
    const seen = artifactPublicLinkResultSchema.parse(await (await route(peer.token)).json());
    expect(seen.link).toMatchObject({ can_disable: false, url: shared.link?.url });
    const refused = await route(peer.token, '/disable');
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'FORBIDDEN' });
    const target = { artifact_id, serverId: fixture.serverId };
    expect((await fixture.owner.trpc.artifact.publicLink.query(target)).link?.can_disable).toBe(
        true
    );
    await fixture.owner.trpc.artifact.unshare.mutate(target);
    expect(
        (
            await fetch(
                shared.link?.url.replace(fixture.harness.appOrigin, fixture.harness.url.origin) ??
                    ''
            )
        ).status
    ).toBe(404);
    expect((await route(author.token, '/disable')).status).toBe(200);
    expect((await route(peer.token, '/disable')).status).toBe(200);
    const missing = await fetch(
        new URL('/api/agent/artifacts/art_missing/public-link', fixture.harness.url),
        { headers: { authorization: `Bearer ${author.token}` }, method: 'POST' }
    );
    expect(missing.status).toBe(404);
});

function publish(token: string, metadata: Record<string, string>, body: string) {
    const url = new URL('/api/agent/artifacts/publish-artifact-raw', fixture.harness.url);
    url.search = new URLSearchParams({
        ...metadata,
        title: 'Shared report',
        content_type: 'text/plain',
    }).toString();
    return fetch(url, {
        body: new TextEncoder().encode(body),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        method: 'POST',
    });
}
