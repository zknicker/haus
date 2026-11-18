import { expect, test } from 'bun:test';
import { formatImageGenerationLink } from '@haus/api';
import { fakePng, imageGenerationFixture } from './image-generation-fixture.ts';

const fixture = imageGenerationFixture();
const secretKey = 'sk-image-secret-key-1234';

test('settings: Owner only, keys are never returned', async () => {
    const { owner, peer, serverId } = fixture;
    await expect(peer.trpc.imageGenerationSettings.get.query({ serverId })).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
    });
    await expect(
        peer.trpc.imageGenerationSettings.setKey.mutate({
            apiKey: secretKey,
            provider: 'openai',
            serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    await expect(
        peer.trpc.imageGenerationSettings.removeKey.mutate({ provider: 'openai', serverId })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });

    const before = await owner.trpc.imageGenerationSettings.get.query({ serverId });
    expect(before.providers.map((p) => [p.provider, p.connected])).toEqual([
        ['openai', false],
        ['gemini', false],
    ]);

    const set = await owner.trpc.imageGenerationSettings.setKey.mutate({
        apiKey: secretKey,
        provider: 'openai',
        serverId,
    });
    expect(set.connected).toBe(true);
    expect(set.models.map((model) => model.id)).toEqual([
        'gpt-image-2.5-flare',
        'gpt-image-2.5-sunburst',
    ]);
    const after = await owner.trpc.imageGenerationSettings.get.query({ serverId });
    expect(JSON.stringify([set, after])).not.toContain(secretKey);
    expect(after.providers.find((p) => p.provider === 'gemini')?.connected).toBe(false);

    // Remove and re-add: the provider flips with its key.
    const removed = await owner.trpc.imageGenerationSettings.removeKey.mutate({
        provider: 'openai',
        serverId,
    });
    expect(removed).toMatchObject({ connected: false, updatedAt: null });
    await owner.trpc.imageGenerationSettings.setKey.mutate({
        apiKey: secretKey,
        provider: 'openai',
        serverId,
    });
});

test('models reports availability per Server key; create refuses without a key', async () => {
    const runner = await fixture.mintRunner('run_img_models');
    const models = await fixture.agentCall(runner, 'GET', '/api/agent/image-generation/models');
    const byId = new Map(
        (
            models.body.models as Array<{
                available: boolean;
                model: { id: string };
                unavailableReason: string | null;
            }>
        ).map((status) => [status.model.id, status])
    );
    expect(byId.get('gpt-image-2.5-flare')?.available).toBe(true);
    expect(byId.get('gemini-nano-banana-2.1')).toMatchObject({
        available: false,
        unavailableReason: 'no-key',
    });

    const before = await fixture.rowCount();
    const refused = await fixture.create(runner, {
        model: 'gemini-nano-banana-2.1',
        nonce: 'no-key',
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('IMAGE_GENERATION_NO_KEY');
    expect(refused.body.message).toContain('Settings → Image generation');
    expect(await fixture.rowCount()).toBe(before);
});

test('an unrenderable request fails before any record or provider call', async () => {
    const runner = await fixture.mintRunner('run_img_invalid');
    const before = await fixture.rowCount();
    const calls = fixture.providerCalls.length;
    const refused = await fixture.create(runner, {
        nonce: 'bad-size',
        size: { height: 1000, width: 1001 },
    });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toContain('Nearest supported size: 1008x1008');
    expect(await fixture.rowCount()).toBe(before);
    expect(fixture.providerCalls.length).toBe(calls);
});

test('create runs to ready, writes an attachment, bills from usage, and replays idempotently', async () => {
    fixture.behavior.mode = 'ok';
    const runner = await fixture.mintRunner('run_img_ready');
    const body = { nonce: 'ready-1', quality: 'high', size: { height: 1024, width: 1024 } };
    const created = await fixture.create(runner, body);
    expect(created.status).toBe(200);
    expect(created.body.idempotent).toBe(false);
    const generation = created.body.generation;
    expect(created.body.link).toBe(formatImageGenerationLink(generation.id));
    expect(generation.request.aspectRatio).toEqual({ height: 1, width: 1 });
    expect(generation.modelDisplayName).toBe('GPT Image 2.5 Sunburst');

    const ready = await fixture.settled(runner, generation.id);
    expect(ready.result).toMatchObject({
        height: 1024,
        resolution: '1K',
        state: 'ready',
        width: 1024,
    });
    if (ready.result.state !== 'ready') {
        throw new Error('not ready');
    }
    // 100 text tokens * $5/M + 1000 output tokens * $30/M
    expect(ready.result.cost).toEqual({ basis: 'usage', usd: 0.0305 });
    expect(fixture.providerCalls.at(-1)).toBe(`openai:${secretKey}:a fox in a hat`);

    const download = await fixture.agentCall(
        runner,
        'GET',
        `/api/agent/attachments/${ready.result.attachmentId}`
    );
    expect(download.status).toBe(200);
    expect(download.body.attachment.mediaType).toBe('image/png');
    expect(Buffer.from(download.body.attachment.dataBase64, 'base64').byteLength).toBe(
        fakePng.byteLength
    );

    const replay = await fixture.create(runner, body);
    expect(replay.body.idempotent).toBe(true);
    expect(replay.body.generation.id).toBe(generation.id);
    const conflict = await fixture.create(runner, { nonce: 'ready-1', prompt: 'something else' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('IMAGE_GENERATION_IDEMPOTENCY_CONFLICT');
    // The same model and prompt with a different resolved request is not a replay.
    for (const changed of [
        { quality: 'low' },
        { size: { height: 1024, width: 1008 } },
        { background: 'transparent' },
    ]) {
        const refused = await fixture.create(runner, { ...body, ...changed });
        expect(refused.status).toBe(409);
        expect(refused.body.code).toBe('IMAGE_GENERATION_IDEMPOTENCY_CONFLICT');
    }
});

test('a provider failure is kept as a failed generation with its reason', async () => {
    fixture.behavior.mode = 'fail';
    const runner = await fixture.mintRunner('run_img_failed');
    const created = await fixture.create(runner, { nonce: 'fails-1' });
    const failed = await fixture.settled(runner, created.body.generation.id);
    expect(failed.result).toMatchObject({
        cost: null,
        errorCode: 'rate-limit',
        reason: 'The image provider rate limit was reached.',
        state: 'failed',
    });
    fixture.behavior.mode = 'ok';
});
