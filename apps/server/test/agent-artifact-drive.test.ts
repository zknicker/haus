import { expect, test } from 'bun:test';
import { artifactListResultSchema, artifactPublishResultSchema } from '@haus/api';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { MemoryArtifactStorage } from './artifact-drive-fixture.ts';

const fixture = agentCreationFixture(undefined, new MemoryArtifactStorage());

test('Agents browse folders, pull a prefix recursively, resolve paths, and move', async () => {
    const runner = await fixture.mintRunner('run_artifact_drive');
    for (const path of ['kit/a.md', 'kit/scripts/b.sh', 'kit/scripts/c.sh', 'top.md']) {
        expect((await publishRaw(runner.token, { path })).status).toBe(200);
    }
    const root = artifactListResultSchema.parse(await get(runner.token, '/api/agent/artifacts'));
    expect(root.folders.map((folder) => [folder.path, folder.file_count])).toEqual([['kit', 3]]);
    expect(root.artifacts.map((item) => item.path)).toEqual(['top.md']);
    expect(root.summary).toEqual({ folders: 1, files_in_folders: 3, files: 1 });
    const pull = artifactListResultSchema.parse(
        await get(runner.token, '/api/agent/artifacts?prefix=kit&recursive=true&order=path&limit=2')
    );
    expect(pull.artifacts.map((item) => item.path)).toEqual(['kit/a.md', 'kit/scripts/b.sh']);
    expect(pull.next_offset).toBe(2);
    expect(pull.summary).toEqual({ folders: 1, files_in_folders: 2, files: 1 });
    const resolved = artifactPublishResultSchema.parse(
        await get(runner.token, '/api/agent/artifacts/by-path?path=KIT/A.md')
    );
    expect(resolved.artifact.path).toBe('kit/a.md');
    const moved = await post(runner.token, '/api/agent/artifacts/move', {
        from: 'kit/scripts',
        to: 'tools',
    });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toEqual({
        from: 'kit/scripts',
        kind: 'folder',
        moved_count: 2,
        to: 'tools',
    });
    const taken = await post(runner.token, '/api/agent/artifacts/move', {
        from: 'tools/b.sh',
        to: 'top.md',
    });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ code: 'PATH_TAKEN' });
    const invalid = await post(runner.token, '/api/agent/artifacts/move', {
        from: 'tools',
        to: '../escape',
    });
    expect(await invalid.json()).toMatchObject({ code: 'INVALID_PATH' });
    const missing = await fetch(
        new URL('/api/agent/artifacts/by-path?path=kit/scripts/b.sh', fixture.harness.url),
        { headers: { authorization: `Bearer ${runner.token}` } }
    );
    expect(missing.status).toBe(404);
});

test('members publish through the App route with the same CAS contract', async () => {
    const token = await fixture.harness.humans.mintSessionToken('user_agent_creation_owner');
    const url = (query: Record<string, string>) => {
        const target = new URL(`/artifacts/${fixture.serverId}/publish`, fixture.harness.url);
        target.search = new URLSearchParams(query).toString();
        return target;
    };
    const put = (query: Record<string, string>, auth = `Bearer ${token}`) =>
        fetch(url(query), {
            body: new TextEncoder().encode(JSON.stringify(query)),
            headers: { authorization: auth, 'content-type': 'application/octet-stream' },
            method: 'PUT',
        });
    const created = await put({ path: 'members/plan.md', request_id: 'member-plan-1' });
    expect(created.status).toBe(200);
    const first = artifactPublishResultSchema.parse(await created.json()).artifact;
    expect(first.creator).toEqual({ type: 'user', user_id: fixture.ownerUserId });
    const blind = await put({ path: 'members/plan.md', request_id: 'member-plan-2' });
    expect(blind.status).toBe(409);
    expect(await blind.json()).toMatchObject({
        code: 'REVISION_CONFLICT',
        current: { revision_id: first.revision_id },
    });
    const replaced = await put({
        path: 'members/plan.md',
        replace: 'true',
        request_id: 'member-plan-3',
    });
    expect(artifactPublishResultSchema.parse(await replaced.json()).artifact.revision_number).toBe(
        2
    );
    expect((await put({ path: 'x.md', request_id: 'member-anon-1' }, 'Bearer nope')).status).toBe(
        401
    );
});

function publishRaw(token: string, metadata: Record<string, string>) {
    const url = new URL('/api/agent/artifacts/publish-artifact-raw', fixture.harness.url);
    url.search = new URLSearchParams({ ...metadata, content_type: 'text/plain' }).toString();
    return fetch(url, {
        body: new TextEncoder().encode(metadata.path),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        method: 'POST',
    });
}
async function get(token: string, route: string) {
    const response = await fetch(new URL(route, fixture.harness.url), {
        headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    return await response.json();
}
function post(token: string, route: string, body: object) {
    return fetch(new URL(route, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
}
