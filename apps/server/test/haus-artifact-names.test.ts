import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { artifactPublishInputSchema } from '@haus/api';
import { publishArtifact } from '../src/artifacts/publish.ts';
import type { ArtifactStorage } from '../src/artifacts/storage.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { findUserByClerkId } from '../src/users/haus-user.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const storage: ArtifactStorage = {
    delete: () => Promise.resolve(),
    downloadUrl: (key) => `https://private-r2.test/${key}`,
    read: () => Promise.resolve(new Uint8Array()),
    upload: async (_key, stream) => {
        const hash = createHash('sha256');
        let size = 0;
        for await (const chunk of stream) {
            hash.update(chunk);
            size += chunk.byteLength;
        }
        return { sha256: hash.digest('hex'), size };
    },
};

let harness: HausServerHarness;
let owner: HausClient;
let connection: Awaited<ReturnType<typeof connectHausDatabase>>;
let serverId: string;
let actor: {
    kind: 'human';
    member: Awaited<ReturnType<typeof findUserByClerkId>>;
    serverId: string;
};

beforeAll(async () => {
    harness = await startHausServerHarness({ artifactStorage: storage });
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('names_owner'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Names HQ', slug: 'names-hq' })
    ).id;
    connection = await connectHausDatabase(harness.databaseUrl);
    actor = {
        kind: 'human',
        member: await findUserByClerkId(connection.db, 'names_owner'),
        serverId,
    };
});
afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

test('an explicit name only creates: a taken name fails and names the existing artifact', async () => {
    const existing = await publish('taken-first', { name: 'taken' }, 'report.txt');
    const id = existing.artifact.artifact_id;
    await expect(publish('taken-second', { name: 'taken' }, 'report.txt')).rejects.toMatchObject({
        code: 'NAME_TAKEN',
        message: `\`taken\` already exists (${id}). Pass --artifact-id ${id} to add a revision, or choose another name.`,
        status: 409,
    });
    const [row] =
        await harness.sql`select count(*)::int as count from artifact_revisions where request_id = 'taken-second'`;
    expect(row.count).toBe(0);
    const revised = await publish('taken-revision', { artifact_id: id }, 'report.txt');
    expect(revised.artifact).toMatchObject({ artifact_id: id, name: 'taken', revision_number: 2 });
});

test('an omitted name derives the first free name from the filename, and retries keep it', async () => {
    const first = await publish('derived-first', {}, 'Q4 Notes.md');
    expect(first.artifact.name).toBe('q4-notes');
    await publish('derived-explicit', { name: 'q4-notes-2' }, 'other.md');
    const second = await publish('derived-second', {}, 'Q4 Notes.md');
    expect(second.artifact.name).toBe('q4-notes-3');
    expect(second.artifact.artifact_id).not.toBe(first.artifact.artifact_id);
    const retry = await publish('derived-first', {}, 'Q4 Notes.md');
    expect(retry.artifact).toMatchObject({
        artifact_id: first.artifact.artifact_id,
        name: 'q4-notes',
        revision_id: first.artifact.revision_id,
    });
    await expect(
        publish('derived-first', { name: 'other-name' }, 'Q4 Notes.md')
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect((await publish('derived-fallback', {}, '.---')).artifact.name).toBe('artifact');
    const long = `${'a'.repeat(140)}.txt`;
    expect((await publish('derived-long-one', {}, long)).artifact.name).toBe('a'.repeat(128));
    expect((await publish('derived-long-two', {}, long)).artifact.name).toBe(
        `${'a'.repeat(126)}-2`
    );
});

test('concurrent publishes without a name never collide on the derived name', async () => {
    const results = await Promise.all(
        ['race-one', 'race-two', 'race-three'].map((requestId) =>
            publish(requestId, {}, 'race.txt')
        )
    );
    expect(results.map((result) => result.artifact.name).sort()).toEqual([
        'race',
        'race-2',
        'race-3',
    ]);
});

function publish(
    requestId: string,
    target: { name?: string; artifact_id?: string },
    filename: string
) {
    return publishArtifact({
        actor,
        db: connection.db,
        input: artifactPublishInputSchema.parse({
            ...target,
            content_type: 'text/plain',
            filename,
            request_id: requestId,
            title: 'Notes',
        }),
        origin: harness.appOrigin,
        storage,
        stream: chunks(requestId),
    });
}
async function* chunks(value: string) {
    yield new TextEncoder().encode(value);
}
