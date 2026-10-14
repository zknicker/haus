import { expect, test } from 'bun:test';
import { formatImageGenerationLink } from '@haus/api';
import { imageGenerationUpdatedTopic } from '../src/realtime/topics.ts';
import { readTargetAsAgent } from './agent-read-target.ts';
import { imageGenerationFixture } from './image-generation-fixture.ts';

const fixture = imageGenerationFixture();
const ghost = 'img_ghostghostghost1';

test('only visible generations link; the projection follows link order; updates fan out', async () => {
    const { channelId, harness, orbitAgentId, owner, peer, serverId } = fixture;
    await owner.trpc.imageGenerationSettings.setKey.mutate({
        apiKey: 'sk-image-secret-key-1234',
        provider: 'openai',
        serverId,
    });
    const runner = await fixture.mintRunner('run_img_links');
    const firstId = (await fixture.create(runner, { nonce: 'link-1' })).body.generation.id;
    const secondId = (await fixture.create(runner, { nonce: 'link-2' })).body.generation.id;
    await fixture.settled(runner, firstId);
    await fixture.settled(runner, secondId);
    const link = formatImageGenerationLink;

    // The owner has not seen either generation, so a human link degrades to its label.
    const human = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `Look ${link(firstId)}`,
        nonce: 'human-unseen',
        serverId,
    });
    expect(human.message.content).toBe('Look Generated image');
    expect(human.message.imageGenerations).toEqual([]);

    await readTargetAsAgent(harness, { agentId: orbitAgentId, serverId }, runner, '#art');
    const events: Array<{ generationId: string; messageId: string }> = [];
    const controller = new AbortController();
    void (async () => {
        for await (const delivery of imageGenerationUpdatedTopic.subscribe(controller.signal)) {
            events.push(delivery.event);
        }
    })().catch(() => undefined);
    await Bun.sleep(20);

    const content = `${link(secondId)} ${link(firstId)} ${link(secondId)} [Gone](image-generation://${ghost})`;
    const sent = await fixture.agentCall(runner, 'POST', '/api/agent/messages/send', {
        content,
        nonce: 'agent-links',
        target: '#art',
    });
    expect(sent.status).toBe(200);
    const messageId = sent.body.message.id as string;
    expect(sent.body.message.content).toBe(
        `${link(secondId)} ${link(firstId)} ${link(secondId)} Gone`
    );
    const rows = (await harness.sql`
        select generation_id, ordinal from image_generation_links
        where server_id = ${serverId} and message_id = ${messageId} order by ordinal
    `) as { generation_id: string; ordinal: number }[];
    expect(rows).toEqual([
        { generation_id: secondId, ordinal: 0 },
        { generation_id: firstId, ordinal: 1 },
    ]);

    // A peer who reads the Message sees both generations, in link order.
    const read = await peer.trpc.chat.message.query({ chatId: channelId, messageId, serverId });
    expect(read.message?.imageGenerations.map(({ id }) => id)).toEqual([secondId, firstId]);
    expect(read.message?.imageGenerations[0]?.result.state).toBe('ready');

    // The link fired one event per generation for that Message.
    await Bun.sleep(50);
    controller.abort();
    expect(
        events
            .filter((event) => event.messageId === messageId)
            .map((event) => event.generationId)
            .sort()
    ).toEqual([firstId, secondId].sort());

    // A retry replays the stored content instead of conflicting.
    const replay = await fixture.agentCall(runner, 'POST', '/api/agent/messages/send', {
        content,
        nonce: 'agent-links',
        target: '#art',
    });
    expect(replay.status).toBe(200);
    expect(replay.body.message.id).toBe(messageId);

    // Now that a readable Message links it, a human can link it too.
    const relinked = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `Again ${link(firstId)}`,
        nonce: 'human-seen',
        serverId,
    });
    expect(relinked.message.imageGenerations.map(({ id }) => id)).toEqual([firstId]);
});

test('task Messages record image links for Agent and human authors, and replay', async () => {
    const { channelId, harness, orbitAgentId, owner, serverId } = fixture;
    const runner = await fixture.mintRunner('run_img_task_links');
    const generationId = (await fixture.create(runner, { nonce: 'task-link-1' })).body.generation
        .id as string;
    await fixture.settled(runner, generationId);
    const link = formatImageGenerationLink(generationId);
    await readTargetAsAgent(harness, { agentId: orbitAgentId, serverId }, runner, '#art');

    const agentTask = {
        nonce: 'agent-task-img',
        target: '#art',
        titles: [`Review ${link}`, `Ghost [Gone](image-generation://${ghost})`],
    };
    const created = await fixture.agentCall(runner, 'POST', '/api/agent/tasks/create', agentTask);
    expect(created.status).toBe(200);
    const agentMessageId = created.body.tasks[0].message.id as string;
    const agentRows = (await harness.sql`
        select generation_id from image_generation_links
        where server_id = ${serverId} and message_id = ${agentMessageId}
    `) as { generation_id: string }[];
    expect(agentRows).toEqual([{ generation_id: generationId }]);
    // The unseen link degraded to its label, and a retry replays instead of conflicting.
    const replay = await fixture.agentCall(runner, 'POST', '/api/agent/tasks/create', agentTask);
    expect(replay.status).toBe(200);
    expect(JSON.stringify(replay.body)).not.toContain(ghost);

    // The Owner can read the Message above, so a human task may now link the generation too.
    const humanInput = {
        chatId: channelId,
        content: `Polish ${link}`,
        nonce: 'human-task-img',
        serverId,
    };
    const human = await owner.trpc.task.create.mutate(humanInput);
    const humanRows = (await harness.sql`
        select generation_id from image_generation_links
        where server_id = ${serverId} and message_id = ${human.task.messageId}
    `) as { generation_id: string }[];
    expect(humanRows).toEqual([{ generation_id: generationId }]);
    expect((await owner.trpc.task.create.mutate(humanInput)).idempotent).toBe(true);
});
