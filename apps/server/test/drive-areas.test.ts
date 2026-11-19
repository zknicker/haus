import { afterAll, beforeAll, expect, test } from 'bun:test';
import { artifactPublishResultSchema } from '@haus/api';
import { deleteManyArtifacts } from '../src/artifacts/delete-many.ts';
import { resolveRunnerCredential } from '../src/computers/runner-credentials.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { MemoryArtifactStorage } from './artifact-drive-fixture.ts';

const fixture = agentCreationFixture(undefined, new MemoryArtifactStorage());
let connection: Awaited<ReturnType<typeof connectHausDatabase>>;
let requests = 0;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});
afterAll(async () => {
    await connection.close();
});

test('a path outside the areas is INVALID_PATH', async () => {
    const orbit = await fixture.mintRunner('run_areas_invalid');
    const refusals = [];
    for (const path of [
        'notes.md',
        'agents/notes.md',
        'agents/nobody/notes.md',
        'projects/web/notes.md',
        'haus',
    ]) {
        const response = await publish(orbit.token, { path });
        refusals.push([path, response.status, ((await response.json()) as { code: string }).code]);
    }
    expect(refusals).toEqual([
        ['notes.md', 400, 'INVALID_PATH'],
        ['agents/notes.md', 400, 'INVALID_PATH'],
        ['agents/nobody/notes.md', 400, 'INVALID_PATH'],
        ['projects/web/notes.md', 400, 'INVALID_PATH'],
        ['haus', 400, 'INVALID_PATH'],
    ]);
    const unknown = await publish(orbit.token, { path: 'agents/nobody/notes.md' });
    expect(await unknown.json()).toEqual({
        code: 'INVALID_PATH',
        message: 'No Agent has the handle `nobody`, so `agents/nobody/notes.md` has no area.',
    });
});

test('the area prefix lands in its canonical spelling', async () => {
    const orbit = await fixture.mintRunner('run_areas_canonical');
    expect(await publishedPath(publish(orbit.token, { path: 'HAUS/Plan.md' }))).toBe(
        'haus/Plan.md'
    );
    expect(await publishedPath(publish(orbit.token, { path: 'Agents/ORBIT/Notes.md' }))).toBe(
        'agents/orbit/Notes.md'
    );
});

test("an Agent cannot create, revise, delete, or move in another Agent's area", async () => {
    const orbit = await fixture.mintRunner('run_areas_owner');
    const peer = await fixture.mintRunner('run_areas_peer', fixture.peerAgentId);
    const own = await published(publish(orbit.token, { path: 'agents/orbit/rules.md' }));
    await published(publish(orbit.token, { path: 'haus/shared.md' }));
    const attempts = [
        await publish(peer.token, { path: 'agents/orbit/new.md' }),
        await publish(peer.token, {
            base_revision_id: own.revision_id,
            path: 'agents/orbit/rules.md',
        }),
        await post(peer.token, `/api/agent/artifacts/${own.artifact_id}/delete`, {}),
        await post(peer.token, '/api/agent/artifacts/move', {
            from: 'agents/orbit/rules.md',
            to: 'haus/rules.md',
        }),
        await post(peer.token, '/api/agent/artifacts/move', {
            from: 'haus/shared.md',
            to: 'agents/orbit/shared.md',
        }),
        await post(peer.token, '/api/agent/artifacts/move', {
            from: 'agents/orbit',
            to: 'haus/orbit-copy',
        }),
    ];
    expect(
        await Promise.all(
            attempts.map(async (response) => [
                response.status,
                ((await response.json()) as { code: string }).code,
            ])
        )
    ).toEqual(Array.from({ length: 6 }, () => [403, 'FORBIDDEN']));
    const runner = await resolveRunnerCredential(connection.db, peer.token);
    if (!runner) {
        throw new Error('The peer runner did not resolve.');
    }
    expect(
        await deleteManyArtifacts(
            connection.db,
            { kind: 'agent', runner },
            { artifact_ids: [own.artifact_id] }
        )
    ).toEqual({ deleted: [], forbidden: [own.artifact_id], missing: [] });
    const peerOwn = await publish(peer.token, { path: 'agents/peer/notes.md' });
    expect(peerOwn.status).toBe(200);
});

test("people write every Agent's area", async () => {
    const orbit = await fixture.mintRunner('run_areas_people');
    const own = await published(publish(orbit.token, { path: 'agents/orbit/people.md' }));
    const revised = await memberPublish({
        base_revision_id: own.revision_id,
        path: 'agents/orbit/people.md',
    });
    expect(revised.status).toBe(200);
    expect(
        await fixture.owner.trpc.artifact.move.mutate({
            from: 'agents/orbit/people.md',
            serverId: fixture.serverId,
            to: 'agents/peer/people.md',
        })
    ).toEqual({
        from: 'agents/orbit/people.md',
        kind: 'file',
        moved_count: 1,
        to: 'agents/peer/people.md',
    });
    expect(
        await fixture.owner.trpc.artifact.delete.mutate({
            artifact_id: own.artifact_id,
            serverId: fixture.serverId,
        })
    ).toEqual({ ok: true });
});

test("a retired Agent's area stays a valid path and an area", async () => {
    await fixture.harness
        .sql`update agents set retired_at = now() where id = ${fixture.peerAgentId}`;
    const created = await memberPublish({ path: 'agents/peer/archive.md' });
    expect(created.status).toBe(200);
    expect(artifactPublishResultSchema.parse(await created.json()).artifact.path).toBe(
        'agents/peer/archive.md'
    );
    const { areas } = await fixture.owner.trpc.drive.changes.query({ serverId: fixture.serverId });
    expect(areas.find((area) => area.area === `agent:${fixture.peerAgentId}`)?.root).toBe(
        'agents/peer'
    );
});

function publish(token: string, query: Record<string, string>) {
    requests += 1;
    const url = new URL('/api/agent/artifacts/publish-artifact-raw', fixture.harness.url);
    url.search = new URLSearchParams({
        content_type: 'text/plain',
        request_id: `areas-request-${requests}`,
        ...query,
    }).toString();
    return fetch(url, {
        body: new TextEncoder().encode(`bytes ${requests}`),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        method: 'POST',
    });
}

async function memberPublish(query: Record<string, string>) {
    requests += 1;
    const url = new URL(`/artifacts/${fixture.serverId}/publish`, fixture.harness.url);
    url.search = new URLSearchParams({
        request_id: `areas-member-${requests}`,
        ...query,
    }).toString();
    const token = await fixture.harness.humans.mintSessionToken('user_agent_creation_owner');
    return await fetch(url, {
        body: new TextEncoder().encode(`member ${requests}`),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        method: 'PUT',
    });
}

async function published(pending: Promise<Response>) {
    const response = await pending;
    expect(response.status).toBe(200);
    return artifactPublishResultSchema.parse(await response.json()).artifact;
}

async function publishedPath(pending: Promise<Response>) {
    return (await published(pending)).path;
}

function post(token: string, route: string, body: object) {
    return fetch(new URL(route, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
}
