import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { artifactPublishInputSchema, artifactTextMaxBytes } from '@haus/api';
import { publishArtifact } from '../src/artifacts/publish.ts';
import type { ArtifactStorage } from '../src/artifacts/storage.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { findUserByClerkId } from '../src/users/haus-user.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const objects = new Map<string, Uint8Array>();
const reads: number[] = [];
const storage: ArtifactStorage = {
    delete: () => Promise.resolve(),
    downloadUrl: (key) => `https://private-r2.test/${key}`,
    read: (key, maxBytes) => {
        reads.push(maxBytes);
        return Promise.resolve((objects.get(key) ?? new Uint8Array()).slice(0, maxBytes));
    },
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

let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let connection: Awaited<ReturnType<typeof connectHausDatabase>>;
let serverId: string;
let actor: {
    kind: 'human';
    member: Awaited<ReturnType<typeof findUserByClerkId>>;
    serverId: string;
};

beforeAll(async () => {
    harness = await startHausServerHarness({ artifactStorage: storage });
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('text_owner'));
    outsider = createHausClient(harness, await harness.clerk.mintSessionToken('text_outsider'));
    serverId = (await owner.trpc.server.create.mutate({ displayName: 'Text HQ', slug: 'text-hq' }))
        .id;
    connection = await connectHausDatabase(harness.databaseUrl);
    actor = {
        kind: 'human',
        member: await findUserByClerkId(connection.db, 'text_owner'),
        serverId,
    };
});
afterAll(async () => {
    owner.close();
    outsider.close();
    await connection.close();
    await harness.close();
});

test('members read each immutable revision as UTF-8 text; outsiders are refused', async () => {
    const first = await publish('text-one', null, '# Notes');
    const second = await publish('text-two', first.artifact.artifact_id, '# Notes v2');
    expect(await owner.trpc.artifact.text.query(target(first))).toEqual({
        status: 'text',
        text: '# Notes',
    });
    expect(await owner.trpc.artifact.text.query(target(second))).toEqual({
        status: 'text',
        text: '# Notes v2',
    });
    await expect(outsider.trpc.artifact.text.query(target(first))).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
    });
});

test('an oversize revision is refused from metadata without reading storage', async () => {
    const large = await publish('text-large', null, 'a'.repeat(artifactTextMaxBytes + 1));
    reads.length = 0;
    expect(await owner.trpc.artifact.text.query(target(large))).toEqual({
        limit_bytes: artifactTextMaxBytes,
        status: 'too_large',
    });
    expect(reads).toEqual([]);
});

test('a revision that is not valid UTF-8 reads as binary', async () => {
    const binary = await publish('text-binary', null, Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0));
    expect(await owner.trpc.artifact.text.query(target(binary))).toEqual({ status: 'binary' });
});

function target(result: { artifact: { artifact_id: string; revision_id: string } }) {
    return {
        artifact_id: result.artifact.artifact_id,
        revision_id: result.artifact.revision_id,
        serverId,
    };
}
function publish(requestId: string, artifactId: string | null, body: string | Uint8Array) {
    return publishArtifact({
        actor,
        db: connection.db,
        input: artifactPublishInputSchema.parse({
            content_type: 'text/markdown',
            filename: 'readme.md',
            ...(artifactId ? { artifact_id: artifactId } : {}),
            request_id: requestId,
            title: 'Readme',
        }),
        origin: harness.appOrigin,
        storage,
        stream: chunks(typeof body === 'string' ? new TextEncoder().encode(body) : body),
    });
}
async function* chunks(bytes: Uint8Array) {
    yield bytes;
}
