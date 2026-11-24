import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    type DriveAreaCounters,
    type DriveChange,
    artifactPublishInputSchema,
    driveChangesResultSchema,
} from '@haus/api';
import { publishArtifact } from '../src/artifacts/publish.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { MemoryArtifactStorage } from './artifact-drive-fixture.ts';

const storage = new MemoryArtifactStorage();
const fixture = agentCreationFixture(undefined, { artifactStorage: storage });
let connection: Awaited<ReturnType<typeof connectHausDatabase>>;
let owner: { kind: 'human'; member: Awaited<ReturnType<typeof findUserById>>; serverId: string };
let requests = 0;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    owner = {
        kind: 'human',
        member: await findUserById(connection.db, fixture.ownerUserId),
        serverId: fixture.serverId,
    };
});
afterAll(async () => {
    await connection.close();
});

test('drive.changes from any counter returns exactly the paths changed since, tombstones included, and finishes under continuous writes', async () => {
    const orbit = `agent:${fixture.orbitAgentId}`;
    const fresh = await changes({});
    const projects = fresh.areas.filter((area) => area.area.startsWith('project:'));
    const seeded = Object.fromEntries(projects.map((area) => [area.area, area.counter]));
    expect(
        fresh.changes.map((change) => [change.area, change.path.replace(/^projects\/[^/]+\//u, '')])
    ).toEqual(projects.flatMap((area) => (area.counter > 0 ? [[area.area, 'AGENTS.md']] : [])));
    expect(fresh.areas.filter((area) => !area.area.startsWith('project:'))).toEqual(
        [
            { area: 'haus', counter: 0, root: 'haus' },
            { area: orbit, counter: 0, root: 'agents/orbit' },
            { area: `agent:${fixture.peerAgentId}`, counter: 0, root: 'agents/peer' },
            { area: `agent:${fixture.coveAgentId}`, counter: 0, root: 'agents/cove' },
        ].sort((left, right) => (left.area < right.area ? -1 : 1))
    );

    const a = await publish({ path: 'haus/notes/a.md', body: 'a1' });
    const a2 = await publish({ base: a.revision_id, body: 'a2', path: 'haus/notes/a.md' });
    const b = await publish({ path: 'haus/notes/b.md', body: 'b1' });
    await fixture.owner.trpc.artifact.delete.mutate({
        artifact_id: b.artifact_id,
        serverId: fixture.serverId,
    });
    await move('haus/notes/a.md', 'haus/notes/c.md');
    await move('haus/notes/c.md', 'agents/orbit/c.md');

    const all = await changes({ since: seeded });
    expect(all.until).toEqual({
        ...seeded,
        [`agent:${fixture.coveAgentId}`]: 0,
        [`agent:${fixture.peerAgentId}`]: 0,
        haus: 7,
        [orbit]: 1,
    });
    expect(all.complete).toBe(true);
    expect(all.changes.map(brief)).toEqual([
        [orbit, 1, 'agents/orbit/c.md', 'put', a2.revision_id],
        ['haus', 4, 'haus/notes/b.md', 'delete', null],
        ['haus', 5, 'haus/notes/a.md', 'delete', null],
        ['haus', 7, 'haus/notes/c.md', 'delete', null],
    ]);
    expect(all.changes[0]).toEqual({
        area: orbit,
        artifact_id: a.artifact_id,
        change: 'put',
        content_type: 'text/plain',
        path: 'agents/orbit/c.md',
        revision_id: a2.revision_id,
        sequence: 1,
        sha256: a2.sha256,
        size_bytes: 2,
    });
    expect(all.changes[1]).toEqual({
        area: 'haus',
        artifact_id: b.artifact_id,
        change: 'delete',
        content_type: null,
        path: 'haus/notes/b.md',
        revision_id: null,
        sequence: 4,
        sha256: null,
        size_bytes: null,
    });

    const middle = await changes({ since: { ...seeded, haus: 4, [orbit]: 1 } });
    expect(middle.changes.map(brief)).toEqual([
        ['haus', 5, 'haus/notes/a.md', 'delete', null],
        ['haus', 7, 'haus/notes/c.md', 'delete', null],
    ]);

    const renamed = await publish({ path: 'haus/case.md', body: 'case' });
    await move('haus/case.md', 'haus/CASE.md');
    expect((await changes({ since: { ...all.until, haus: 7 } })).changes.map(brief)).toEqual([
        ['haus', 10, 'haus/CASE.md', 'put', renamed.revision_id],
    ]);
});

test('a page holds at most 1,000 changes, and writes during paging wait for the next call', async () => {
    const start = (await changes({})).until;
    const before = start.haus ?? 0;
    for (let index = 0; index < 501; index += 1) {
        await publish({ path: `haus/bulk/${String(index).padStart(3, '0')}.md`, body: 'x' });
    }
    await move('haus/bulk', 'haus/bulk-moved');
    const first = await changes({ since: { ...start, haus: before + 501 } });
    expect(first.until.haus).toBe(before + 501 + 1002);
    expect(first.changes).toHaveLength(1000);
    expect(first.complete).toBe(false);
    const last = first.changes.at(-1)?.sequence ?? 0;
    expect(last).toBe(before + 501 + 1000);

    const late = await publish({ path: 'haus/late.md', body: 'late' });
    const second = await changes({ since: { ...start, haus: last }, until: first.until });
    expect(second.complete).toBe(true);
    expect(second.until).toEqual(first.until);
    expect(second.changes.map((change) => change.path)).toEqual([
        'haus/bulk-moved/499.md',
        'haus/bulk-moved/500.md',
    ]);

    const next = await changes({ since: first.until });
    expect(next.changes.map(brief)).toEqual([
        ['haus', before + 501 + 1002 + 1, 'haus/late.md', 'put', late.revision_id],
    ]);
});

test('the Agent route reads changes with JSON-encoded counters', async () => {
    const runner = await fixture.mintRunner('run_drive_changes_route');
    const counters = (await changes({})).until;
    const hausCounter = counters.haus ?? 0;
    const created = await publish({ path: 'haus/route.md', body: 'route' });
    const response = await agentChanges(runner.token, { since: JSON.stringify(counters) });
    expect(response.status).toBe(200);
    const body = driveChangesResultSchema.parse(await response.json());
    expect(body.changes.map(brief)).toEqual([
        ['haus', hausCounter + 1, 'haus/route.md', 'put', created.revision_id],
    ]);
    const badJson = await agentChanges(runner.token, { since: '{haus' });
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toMatchObject({ code: 'INVALID_ARG' });
    const badShape = await agentChanges(runner.token, { until: JSON.stringify({ haus: -1 }) });
    expect(badShape.status).toBe(400);
    expect(await badShape.json()).toMatchObject({ code: 'INVALID_ARG' });
    const anonymous = await fetch(new URL('/api/agent/drive/changes', fixture.harness.url));
    expect(anonymous.status).toBe(401);
});

function changes(input: { since?: DriveAreaCounters; until?: DriveAreaCounters }) {
    return fixture.owner.trpc.drive.changes.query({
        serverId: fixture.serverId,
        since: input.since ?? {},
        ...(input.until ? { until: input.until } : {}),
    });
}

function agentChanges(token: string, query: Record<string, string>) {
    const url = new URL('/api/agent/drive/changes', fixture.harness.url);
    url.search = new URLSearchParams(query).toString();
    return fetch(url, { headers: { authorization: `Bearer ${token}` } });
}

function brief(change: DriveChange) {
    return [change.area, change.sequence, change.path, change.change, change.revision_id];
}

async function publish(write: { base?: string; body: string; path: string }) {
    requests += 1;
    const result = await publishArtifact({
        actor: owner,
        db: connection.db,
        input: artifactPublishInputSchema.parse({
            base_revision_id: write.base,
            content_type: 'text/plain',
            path: write.path,
            request_id: `changes-request-${requests}`,
        }),
        origin: fixture.harness.appOrigin,
        storage,
        stream: chunks(write.body),
    });
    return result.artifact;
}

function move(from: string, to: string) {
    return fixture.owner.trpc.artifact.move.mutate({ from, serverId: fixture.serverId, to });
}

async function* chunks(value: string) {
    yield new TextEncoder().encode(value);
}
