import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentImageGenerationCreateInputSchema } from '@haus/api';
import type { AttachmentRoot } from '../src/attachments/attachment-root.ts';
import { resolveImageGenerationRequest } from '../src/image-generation/image-generation-request.ts';
import { ImageProviderError } from '../src/image-generation/providers/image-provider.ts';
import {
    failInterruptedImageGenerations,
    runImageGeneration,
    sweepPendingImageGenerations,
} from '../src/image-generation/run-image-generation.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { imageGenerationFixture } from './image-generation-fixture.ts';

const fixture = imageGenerationFixture();
let connection: HausConnection;

beforeAll(async () => {
    await fixture.owner.trpc.imageGenerationSettings.setKey.mutate({
        apiKey: 'sk-image-secret-key-1234',
        provider: 'openai',
        serverId: fixture.serverId,
    });
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
});

test('a generation always settles, even when announcing throws or the adapter breaks', async () => {
    const throwingAnnounce = () => Promise.reject(new Error('realtime is down'));
    // The provider fails before any attachment is written, so the root is never touched.
    const root = {} as AttachmentRoot;
    const run = (adapterError: Error) => ({
        adapters: {
            gemini: { generate: () => Promise.reject(adapterError) },
            openai: { generate: () => Promise.reject(adapterError) },
        },
        announce: throwingAnnounce,
        db: connection.db,
        root,
    });

    const providerId = await insertPending('settle-provider');
    await runImageGeneration(
        run(new ImageProviderError('rate-limit', 'The image provider rate limit was reached.')),
        providerId
    );
    expect(await readState(providerId)).toMatchObject({
        error_code: 'rate-limit',
        failure_reason: 'The image provider rate limit was reached.',
        state: 'failed',
    });

    const internalId = await insertPending('settle-internal');
    await runImageGeneration(run(new Error('column "secret_detail" does not exist')), internalId);
    const internal = await readState(internalId);
    expect(internal).toMatchObject({
        error_code: 'server-error',
        failure_reason: 'The Server could not finish this image.',
        state: 'failed',
    });
});

test('pending is the durable queue: a double claim calls the provider once', async () => {
    const calls = countingRun();
    const id = await insertPending('claim-once');
    await Promise.all([runImageGeneration(calls.deps, id), runImageGeneration(calls.deps, id)]);
    expect(calls.count()).toBe(1);
    expect((await readState(id))?.state).toBe('failed');
});

test('startup fails generating rows and leaves pending rows for the sweep', async () => {
    const pendingId = await insertPending('boot-pending');
    const generatingId = await insertPending('boot-generating');
    await fixture.harness.sql`
        update image_generations set state = 'generating' where id = ${generatingId}
    `;
    await failInterruptedImageGenerations(connection.db);
    expect((await readState(generatingId))?.error_code).toBe('server-restarted');
    expect((await readState(pendingId))?.state).toBe('pending');

    const calls = countingRun();
    await sweepPendingImageGenerations(calls.deps);
    expect(calls.count()).toBeGreaterThanOrEqual(1);
    expect((await readState(pendingId))?.state).toBe('failed');
    expect((await readState(pendingId))?.error_code).toBe('server-error');
});

test('a failed dispatch leaves the row claimable and a sweep completes it', async () => {
    const id = await insertPending('dispatch-fails');
    const calls = countingRun();
    const brokenDb = new Proxy(connection.db, {
        get(target, property, receiver) {
            if (property === 'update') {
                throw new Error('database unavailable');
            }
            return Reflect.get(target, property, receiver);
        },
    });
    await expect(runImageGeneration({ ...calls.deps, db: brokenDb }, id)).rejects.toThrow(
        'database unavailable'
    );
    expect(calls.count()).toBe(0);
    expect((await readState(id))?.state).toBe('pending');

    await sweepPendingImageGenerations(calls.deps);
    expect(calls.count()).toBe(1);
    expect((await readState(id))?.state).toBe('failed');
});

function countingRun() {
    let count = 0;
    const generate = () => {
        count += 1;
        return Promise.reject(new Error('provider stub'));
    };
    return {
        count: () => count,
        deps: {
            adapters: { gemini: { generate }, openai: { generate } },
            announce: () => Promise.resolve(),
            db: connection.db,
            root: {} as AttachmentRoot,
        },
    };
}

async function insertPending(nonce: string) {
    const id = `img_${nonce.replace(/\W/gu, '').padEnd(16, 'x').slice(0, 16)}`;
    const { model, request } = resolveImageGenerationRequest(
        agentImageGenerationCreateInputSchema.parse({
            model: 'gpt-image-2.5-sunburst',
            nonce,
            prompt: 'a fox',
        })
    );
    await fixture.harness.sql`
        insert into image_generations (
            id, server_id, agent_id, computer_id, model, model_display_name, nonce, prompt,
            provider, request
        )
        select ${id}, ${fixture.serverId}, ${fixture.orbitAgentId}, computer_id, ${model.id},
            ${model.displayName}, ${nonce}, 'a fox', ${model.provider}, ${request}::jsonb
        from agents where id = ${fixture.orbitAgentId}
    `;
    return id;
}

async function readState(id: string) {
    const [row] = (await fixture.harness.sql`
        select state, error_code, failure_reason from image_generations where id = ${id}
    `) as { error_code: string | null; failure_reason: string | null; state: string }[];
    return row;
}
