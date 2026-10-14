import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentImageGenerationCreateInputSchema, formatImageGenerationLink } from '@haus/api';
import type { AttachmentRoot } from '../src/attachments/attachment-root.ts';
import {
    enqueueImageGenerationFailureNotice,
    imageGenerationFailureNoticeText,
} from '../src/image-generation/image-generation-failure-notice.ts';
import { resolveImageGenerationRequest } from '../src/image-generation/image-generation-request.ts';
import { ImageProviderError } from '../src/image-generation/providers/image-provider.ts';
import {
    failInterruptedImageGenerations,
    runImageGeneration,
} from '../src/image-generation/run-image-generation.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { imageGenerationFixture } from './image-generation-fixture.ts';

const fixture = imageGenerationFixture();
let connection: HausConnection;
let secondChannelId = '';

beforeAll(async () => {
    await fixture.owner.trpc.imageGenerationSettings.setKey.mutate({
        apiKey: 'sk-image-secret-key-1234',
        provider: 'openai',
        serverId: fixture.serverId,
    });
    secondChannelId = (
        await fixture.owner.trpc.chat.createChannel.mutate({
            agentIds: [fixture.orbitAgentId],
            name: 'art2',
            serverId: fixture.serverId,
        })
    ).id;
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
});

test('a failure notifies the requesting Agent once, in the earliest linking Chat', async () => {
    const id = await insertGeneration('notice-earliest', 'pending');
    await linkFrom(id, '#art2', 'first');
    await linkFrom(id, '#art', 'second');
    const wakes: unknown[] = [];
    const deps = failingDeps((wake) => {
        wakes.push(wake);
        return Promise.resolve();
    });

    await runImageGeneration(deps, id);
    await enqueueImageGenerationFailureNotice(connection.db, await readRow(id));

    const rows = await noticeRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
        agent_id: fixture.orbitAgentId,
        chat_id: secondChannelId,
        source: 'image_generation_failed',
        state: 'queued',
    });
    expect(rows[0]?.content).toContain('Image generation failed: GPT Image 2.5 Sunburst');
    expect(rows[0]?.content).toContain('Reason: The image provider rate limit was reached.');
    expect(rows[0]?.content).toContain(formatImageGenerationLink(id));
    expect(wakes).toEqual([{ agentId: fixture.orbitAgentId, serverId: fixture.serverId }]);
});

test('a restart-failed generation notifies once', async () => {
    const id = await insertGeneration('notice-restart', 'generating');
    await linkFrom(id, '#art', 'restart');
    const wakes: unknown[] = [];
    await failInterruptedImageGenerations(connection.db, (wake) => {
        wakes.push(wake);
        return Promise.resolve();
    });
    await failInterruptedImageGenerations(connection.db);

    const rows = await noticeRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chat_id).toBe(fixture.channelId);
    expect(rows[0]?.content).toContain('The Server restarted before this image finished.');
    expect(wakes).toHaveLength(1);
});

test('an unlinked failure sends no notice', async () => {
    const id = await insertGeneration('notice-unlinked', 'pending');
    await runImageGeneration(failingDeps(), id);
    expect(await noticeRows(id)).toEqual([]);
});

test('a successful generation never enqueues a notice', async () => {
    fixture.behavior.mode = 'ok';
    const runner = await fixture.mintRunner('run_img_notice_ok');
    const created = await fixture.create(runner, { nonce: 'notice-ok' });
    const id = created.body.generation.id as string;
    await fixture.agentCall(runner, 'POST', '/api/agent/messages/send', {
        content: formatImageGenerationLink(id),
        nonce: 'notice-ok-link',
        target: '#art',
    });
    const generation = await fixture.settled(runner, id);
    expect(generation.result.state).toBe('ready');
    expect(await noticeRows(id)).toEqual([]);
});

test('the notice text names the model, link, reason, and one Next line', () => {
    expect(
        imageGenerationFailureNoticeText({
            failureReason: 'The provider key was removed.',
            id: 'img_abcdefghijklmnop',
            modelDisplayName: 'Nano Banana 2.1',
        })
    ).toBe(
        [
            '⚠️ Image generation failed: Nano Banana 2.1',
            formatImageGenerationLink('img_abcdefghijklmnop'),
            'Reason: The provider key was removed.',
            'Next: tell the person it failed; if a retry would help, run haus image generate with another model.',
        ].join('\n')
    );
});

function failingDeps(wake?: (wake: { agentId: string; serverId: string }) => Promise<void>) {
    const generate = () =>
        Promise.reject(
            new ImageProviderError('rate-limit', 'The image provider rate limit was reached.')
        );
    return {
        adapters: { gemini: { generate }, openai: { generate } },
        announce: () => Promise.resolve(),
        db: connection.db,
        root: {} as AttachmentRoot,
        wake,
    };
}

async function linkFrom(generationId: string, target: string, nonce: string) {
    const runner = await fixture.mintRunner(`run_img_notice_${nonce}`);
    const sent = await fixture.agentCall(runner, 'POST', '/api/agent/messages/send', {
        content: formatImageGenerationLink(generationId),
        nonce: `notice-link-${nonce}`,
        target,
    });
    expect(sent.status).toBe(200);
    await Bun.sleep(5);
}

async function insertGeneration(nonce: string, state: 'generating' | 'pending') {
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
            provider, request, state
        )
        select ${id}, ${fixture.serverId}, ${fixture.orbitAgentId}, computer_id, ${model.id},
            ${model.displayName}, ${nonce}, 'a fox', ${model.provider}, ${request}::jsonb, ${state}
        from agents where id = ${fixture.orbitAgentId}
    `;
    return id;
}

async function readRow(id: string) {
    const [row] = (await fixture.harness.sql`
        select agent_id as "agentId", failure_reason as "failureReason", id,
            model_display_name as "modelDisplayName", server_id as "serverId"
        from image_generations where id = ${id}
    `) as Parameters<typeof enqueueImageGenerationFailureNotice>[1][];
    if (!row) {
        throw new Error('The generation row is missing.');
    }
    return row;
}

async function noticeRows(id: string) {
    return (await fixture.harness.sql`
        select agent_id, chat_id, content, source, state from agent_inbox
        where dedupe_key = ${`image-generation-failed:${id}`}
    `) as {
        agent_id: string;
        chat_id: string;
        content: string;
        source: string;
        state: string;
    }[];
}
