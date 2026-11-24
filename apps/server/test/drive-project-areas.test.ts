import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type ArtifactRecord, artifactPublishResultSchema } from '@haus/api';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { seedProjectRules } from '../src/projects/project-rules.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { MemoryArtifactStorage } from './artifact-drive-fixture.ts';
import { createTestProject } from './project.fixture.ts';

const storage = new MemoryArtifactStorage();
const fixture = agentCreationFixture(undefined, { artifactStorage: storage });
let connection: Awaited<ReturnType<typeof connectHausDatabase>>;
let requests = 0;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});
afterAll(async () => {
    await connection.close();
});

test("creating a Project writes its rules file, and its Agent's profile names the key", async () => {
    const product = await projectOf(fixture.channelId);
    const rules = await byPath(`projects/${product.key}/AGENTS.md`);
    expect(rules.author).toEqual({ type: 'haus' });
    expect(await textOf(rules)).toBe('# product rules\n');

    const orbit = await fixture.mintRunner('run_project_profile');
    const profile = await fetch(new URL('/api/agent/profile', fixture.harness.url), {
        headers: { authorization: `Bearer ${orbit.token}` },
    });
    expect(await profile.json()).toMatchObject({ profile: { projectKey: product.key } });
});

test('a Project path lands in the Project area under its canonical key', async () => {
    const product = await projectOf(fixture.channelId);
    const orbit = await fixture.mintRunner('run_project_publish');
    const response = await publish(orbit.token, {
        path: `projects/${product.key.toLowerCase()}/Plan.md`,
    });
    expect(response.status).toBe(200);
    const path = `projects/${product.key}/Plan.md`;
    expect(artifactPublishResultSchema.parse(await response.json()).artifact.path).toBe(path);

    const area = `project:${product.chatId}`;
    const changes = await fixture.owner.trpc.drive.changes.query({ serverId: fixture.serverId });
    expect(changes.areas.find((entry) => entry.area === area)).toEqual({
        area,
        counter: 2,
        root: `projects/${product.key}`,
    });
    expect(
        changes.changes.filter((change) => change.area === area).map((change) => change.path)
    ).toEqual([`projects/${product.key}/AGENTS.md`, path]);
});

test('a path naming no Project, or sitting directly in projects/, is INVALID_PATH', async () => {
    const orbit = await fixture.mintRunner('run_project_invalid');
    const missing = await publish(orbit.token, { path: 'projects/NOPE/notes.md' });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({
        code: 'INVALID_PATH',
        message: 'No Project has the key `NOPE`, so `projects/NOPE/notes.md` has no area.',
    });
    const loose = await publish(orbit.token, { path: 'projects/notes.md' });
    expect(loose.status).toBe(400);
    expect(((await loose.json()) as { code: string }).code).toBe('INVALID_PATH');
});

test('seeding Project rules again never overwrites the file', async () => {
    const product = await projectOf(fixture.channelId);
    const path = `projects/${product.key}/AGENTS.md`;
    const seeded = await byPath(path);
    const edited = await memberPublish(
        { base_revision_id: seeded.revision_id, path },
        '# product rules\n- Ship behind a flag.\n'
    );
    expect(edited.status).toBe(200);

    expect(
        await seedProjectRules(connection.db, storage, {
            creator: { agentId: null, userId: fixture.ownerUserId },
            projectId: product.chatId,
            serverId: fixture.serverId,
        })
    ).toBe('present');
    expect(await textOf(await byPath(path))).toBe('# product rules\n- Ship behind a flag.\n');
});

test("changing a Project's key moves its Drive folder", async () => {
    const chat = await createTestProject(fixture.owner, {
        key: 'OPSX',
        name: 'ops-room',
        serverId: fixture.serverId,
    });
    const before = await byPath('projects/OPSX/AGENTS.md');
    await fixture.owner.trpc.project.update.mutate({
        chatId: chat.id,
        key: 'OPSY',
        serverId: fixture.serverId,
    });

    const after = await byPath('projects/OPSY/AGENTS.md');
    expect(after.artifact_id).toBe(before.artifact_id);
    expect(await textOf(after)).toBe('# ops-room rules\n');
    await expect(
        fixture.owner.trpc.artifact.byPath.query({
            path: 'projects/OPSX/AGENTS.md',
            serverId: fixture.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    const changes = await fixture.owner.trpc.drive.changes.query({ serverId: fixture.serverId });
    expect(
        changes.changes
            .filter((change) => change.area === `project:${chat.id}`)
            .map((change) => [change.change, change.path])
    ).toEqual([
        ['delete', 'projects/OPSX/AGENTS.md'],
        ['put', 'projects/OPSY/AGENTS.md'],
    ]);
});

async function projectOf(chatId: string) {
    const projects = await fixture.owner.trpc.project.list.query({ serverId: fixture.serverId });
    const project = projects.find((candidate) => candidate.chatId === chatId);
    if (!project) {
        throw new Error(`Project ${chatId} is missing.`);
    }
    return project;
}

async function byPath(path: string) {
    return (await fixture.owner.trpc.artifact.byPath.query({ path, serverId: fixture.serverId }))
        .artifact;
}

async function textOf(artifact: ArtifactRecord) {
    const read = await fixture.owner.trpc.artifact.text.query({
        artifact_id: artifact.artifact_id,
        revision_id: artifact.revision_id,
        serverId: fixture.serverId,
    });
    return read.status === 'text' ? read.text : null;
}

function publish(token: string, query: Record<string, string>) {
    requests += 1;
    const url = new URL('/api/agent/artifacts/publish-artifact-raw', fixture.harness.url);
    url.search = new URLSearchParams({
        content_type: 'text/markdown',
        request_id: `project-areas-${requests}`,
        ...query,
    }).toString();
    return fetch(url, {
        body: new TextEncoder().encode(`bytes ${requests}`),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        method: 'POST',
    });
}

async function memberPublish(query: Record<string, string>, text: string) {
    requests += 1;
    const url = new URL(`/artifacts/${fixture.serverId}/publish`, fixture.harness.url);
    url.search = new URLSearchParams({
        content_type: 'text/markdown',
        request_id: `project-areas-member-${requests}`,
        ...query,
    }).toString();
    const token = await fixture.harness.humans.mintSessionToken('user_agent_creation_owner');
    return await fetch(url, {
        body: new TextEncoder().encode(text),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        method: 'PUT',
    });
}
