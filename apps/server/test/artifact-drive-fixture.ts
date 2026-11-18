import { afterAll, beforeAll } from 'bun:test';
import { createHash } from 'node:crypto';
import { artifactPublishInputSchema } from '@haus/api';
import { publishArtifact } from '../src/artifacts/publish.ts';
import type { ArtifactStorage } from '../src/artifacts/storage.ts';
import type { ArtifactThumbnails } from '../src/artifacts/thumbnails.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/** An in-memory R2 whose uploads can be held open to force publish races. */
export class MemoryArtifactStorage implements ArtifactStorage {
    readonly objects = new Map<string, Uint8Array>();
    failUploads = false;
    delete(key: string) {
        this.objects.delete(key);
        return Promise.resolve();
    }
    downloadUrl(key: string) {
        return `https://r2.test/${key}`;
    }
    read(key: string, maxBytes: number) {
        return Promise.resolve((this.objects.get(key) ?? new Uint8Array()).slice(0, maxBytes));
    }
    stream(key: string) {
        const bytes = this.objects.get(key);
        return new ReadableStream<Uint8Array>({
            start(controller) {
                if (bytes) {
                    controller.enqueue(bytes);
                    controller.close();
                } else {
                    controller.error(new Error(`No object at ${key}`));
                }
            },
        });
    }
    async upload(key: string, stream: AsyncIterable<Uint8Array>) {
        if (this.failUploads) {
            throw new Error('R2 upload unavailable');
        }
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        this.objects.set(key, bytes);
        return { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
    }
}

export interface DrivePublish {
    base?: string;
    body?: string | Uint8Array;
    contentType?: string;
    /** Resolves when the upload may finish; lets two writers hold uploads open together. */
    gate?: Promise<void>;
    path: string;
    replace?: boolean;
    requestId?: string;
    thumbnails?: ArtifactThumbnails;
}

/** One Server with an owner member, shared by the drive test files. */
export function artifactDriveFixture(slug: string) {
    const storage = new MemoryArtifactStorage();
    const state = {} as {
        harness: HausServerHarness;
        owner: HausClient;
        ownerToken: string;
        connection: Awaited<ReturnType<typeof connectHausDatabase>>;
        serverId: string;
        actor: {
            kind: 'human';
            member: Awaited<ReturnType<typeof findUserById>>;
            serverId: string;
        };
    };
    let requests = 0;
    beforeAll(async () => {
        state.harness = await startHausServerHarness({ artifactStorage: storage });
        state.ownerToken = await state.harness.humans.mintSessionToken(`${slug}_owner`);
        state.owner = createHausClient(state.harness, state.ownerToken);
        state.serverId = (
            await state.owner.trpc.server.create.mutate({ displayName: slug, slug })
        ).id;
        state.connection = await connectHausDatabase(state.harness.databaseUrl);
        state.actor = {
            kind: 'human',
            member: await findUserById(
                state.connection.db,
                state.harness.humans.userIdForSubject(`${slug}_owner`)
            ),
            serverId: state.serverId,
        };
    });
    afterAll(async () => {
        state.owner.close();
        await state.connection.close();
        await state.harness.close();
    });
    async function publish(write: DrivePublish) {
        requests += 1;
        return await publishArtifact({
            actor: state.actor,
            db: state.connection.db,
            input: artifactPublishInputSchema.parse({
                base_revision_id: write.base,
                content_type: write.contentType ?? 'text/plain',
                path: write.path,
                replace: write.replace ?? false,
                request_id: write.requestId ?? `${slug}-request-${requests}`,
            }),
            origin: state.harness.appOrigin,
            storage,
            stream: bytes(write.body ?? write.path, write.gate),
            thumbnails: write.thumbnails,
        });
    }
    return { publish, state, storage };
}

async function* bytes(value: string | Uint8Array, gate?: Promise<void>) {
    yield typeof value === 'string' ? new TextEncoder().encode(value) : value;
    await gate;
}
