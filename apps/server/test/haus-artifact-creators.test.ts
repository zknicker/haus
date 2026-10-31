import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { type ArtifactCreator, artifactPublishInputSchema } from '@haus/api';
import { publishArtifact } from '../src/artifacts/publish.ts';
import { artifactCreator } from '../src/artifacts/read.ts';
import type { ArtifactStorage } from '../src/artifacts/storage.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const agentId = 'agt_artifactcreator01';
const storage: ArtifactStorage = {
    delete: () => Promise.resolve(),
    downloadUrl: (key) => `https://private-r2.test/${key}`,
    stream: () => new ReadableStream(),
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
let outsider: HausClient;
let connection: Awaited<ReturnType<typeof connectHausDatabase>>;
let serverId: string;
let userCreator: ArtifactCreator;
const agentCreator: ArtifactCreator = { type: 'agent', agent_id: agentId };

beforeAll(async () => {
    harness = await startHausServerHarness({ artifactStorage: storage });
    owner = createHausClient(harness, await harness.humans.mintSessionToken('creator_owner'));
    outsider = createHausClient(harness, await harness.humans.mintSessionToken('creator_outsider'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Creator HQ', slug: 'creator-hq' })
    ).id;
    connection = await connectHausDatabase(harness.databaseUrl);
    const member = await findUserById(
        connection.db,
        harness.humans.userIdForSubject('creator_owner')
    );
    if (!member) {
        throw new Error('Owner was not provisioned.');
    }
    userCreator = { type: 'user', user_id: member.id };
    await harness.sql`
        insert into agents (id, server_id, display_name, handle, home_timezone)
        values (${agentId}, ${serverId}, 'Wren', 'creator-wren', 'UTC')
    `;
    const actor = { kind: 'human', member, serverId } as const;
    // Updated order (newest first): agent-d, user-c, user-b, user-a, user-f, agent-e.
    const plan = [
        ['user-a', 3, 1],
        ['user-b', 4, 2],
        ['user-c', 5, 3],
        ['agent-d', 6, 4],
        ['agent-e', 1, 5],
        ['user-f', 2, 6],
    ] as const;
    for (const [name, updatedMinute, createdMinute] of plan) {
        await publishArtifact({
            actor,
            db: connection.db,
            input: artifactPublishInputSchema.parse({
                path: `${name}.txt`,
                request_id: `creator-${name}`,
                title: name,
            }),
            origin: harness.appOrigin,
            storage,
            stream: chunks(name),
        });
        // Artifact creation order is the reverse of update order, so a createdAt sort would fail.
        await harness.sql`
            update artifact_revisions set created_at = ${minute(updatedMinute)}
            where request_id = ${`creator-${name}`}
        `;
        await harness.sql`
            update artifacts set created_at = ${minute(createdMinute)}
            where server_id = ${serverId} and path = ${`${name}.txt`}
        `;
    }
    await harness.sql`
        update artifacts set creator_user_id = null, creator_agent_id = ${agentId}
        where server_id = ${serverId} and path in ('agent-d.txt', 'agent-e.txt')
    `;
});
afterAll(async () => {
    owner.close();
    outsider.close();
    await connection.close();
    await harness.close();
});

test('list sorts by latest revision time and maps creators and timestamps', async () => {
    const { artifacts } = await owner.trpc.artifact.list.query({ serverId });
    expect(artifacts.map((item) => item.title)).toEqual([
        'agent-d',
        'user-c',
        'user-b',
        'user-a',
        'user-f',
        'agent-e',
    ]);
    const [newest] = artifacts;
    expect(newest?.creator).toEqual(agentCreator);
    expect(newest?.updated_at).toBe(minute(6).toISOString());
    expect(newest?.created_at).toBe(minute(4).toISOString());
    expect(artifacts.find((item) => item.title === 'user-a')?.creator).toEqual(userCreator);
});

test('creator filter composes with search and pagination', async () => {
    const list = (creator: ArtifactCreator, query = '', offset = 0) =>
        owner.trpc.artifact.list.query({ creator, offset, query, serverId });
    expect((await list(agentCreator)).artifacts.map((item) => item.title)).toEqual([
        'agent-d',
        'agent-e',
    ]);
    expect((await list(userCreator, 'user-b')).artifacts.map((item) => item.title)).toEqual([
        'user-b',
    ]);
    expect((await list(userCreator, 'agent')).artifacts).toHaveLength(0);
    expect((await list(userCreator, '', 3)).artifacts.map((item) => item.title)).toEqual([
        'user-f',
    ]);
    expect((await list({ type: 'agent', agent_id: 'agt_unknown' })).artifacts).toHaveLength(0);
});

test('creators summarizes each creator with counts and three newest previews', async () => {
    const { creators } = await owner.trpc.artifact.creators.query({ serverId });
    expect(
        creators.map((entry) => ({
            count: entry.artifact_count,
            creator: entry.creator,
            latest: entry.latest_at,
            previews: entry.previews.map((item) => item.title),
        }))
    ).toEqual([
        {
            count: 2,
            creator: agentCreator,
            latest: minute(6).toISOString(),
            previews: ['agent-d', 'agent-e'],
        },
        {
            count: 4,
            creator: userCreator,
            latest: minute(5).toISOString(),
            previews: ['user-c', 'user-b', 'user-a'],
        },
    ]);
    await expect(outsider.trpc.artifact.creators.query({ serverId })).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
    });
});

test('creator mapping refuses rows without exactly one creator', () => {
    expect(() => artifactCreator({ creatorAgentId: null, creatorUserId: null })).toThrow(
        'Artifact has no single creator.'
    );
    expect(() => artifactCreator({ creatorAgentId: 'agent', creatorUserId: 'user' })).toThrow(
        'Artifact has no single creator.'
    );
});

function minute(value: number) {
    return new Date(Date.UTC(2026, 0, 1, 0, value));
}
async function* chunks(value: string) {
    yield new TextEncoder().encode(value);
}
