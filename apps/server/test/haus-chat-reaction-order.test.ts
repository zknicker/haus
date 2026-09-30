import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let chatId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(
        harness,
        await harness.clerk.mintSessionToken('user_reaction_order_owner')
    );
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Reaction Order Server',
        slug: 'reaction-order-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
});
afterAll(async () => {
    owner.close();
    await harness.close();
});

test('reactions list in arrival order, not by emoji', async () => {
    const { message } = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Reaction order target',
        nonce: 'reaction-order-target',
        serverId,
    });
    // 🎉 sorts before 🔥 by code point; arrival order must win.
    await owner.trpc.chat.react.mutate({ emoji: '🔥', messageId: message.id, serverId });
    const { message: reacted } = await owner.trpc.chat.react.mutate({
        emoji: '🎉',
        messageId: message.id,
        serverId,
    });

    expect(reacted.reactions.map(({ emoji }) => emoji)).toEqual(['🔥', '🎉']);
});
