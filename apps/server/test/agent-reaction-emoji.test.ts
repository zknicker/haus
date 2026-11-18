import { beforeAll, expect, test } from 'bun:test';
import { reactionEmojiRule } from '@haus/api';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let messageId: string;

beforeAll(async () => {
    const sent = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'thanks, that is perfect!',
        nonce: 'reaction-allowlist-target',
        serverId: fixture.serverId,
    });
    messageId = sent.message.id;
});

async function react(runId: string, body: Record<string, unknown>) {
    const runner = await fixture.mintRunner(runId);
    const response = await fixture.post('/api/agent/messages/react', runner, {
        messageId,
        ...body,
    });
    return response as typeof response & {
        body: { message?: { reactions?: Array<{ emoji: string }> } };
    };
}

async function storedAgentEmoji() {
    const rows = (await fixture.harness.sql`
        select emoji from message_reactions
        where message_id = ${messageId} and actor_agent_id = ${fixture.orbitAgentId}
        order by emoji
    `) as Array<{ emoji: string }>;
    return rows.map((row) => row.emoji);
}

test('an Agent reaction that is text or several emoji is refused with the rule', async () => {
    for (const [runId, emoji] of [
        ['run_reaction_text', 'thanks'],
        ['run_reaction_pair', '👍👍'],
    ] as const) {
        const refused = await react(runId, { emoji });
        expect(refused.status).toBe(400);
        expect(refused.body).toMatchObject({ code: 'INVALID_ARG', message: reactionEmojiRule });
    }
    expect(await storedAgentEmoji()).toEqual([]);
});

test('an Agent may react with any single emoji', async () => {
    const added = await react('run_reaction_any', { emoji: '🫡' });

    expect(added.status).toBe(200);
    expect(await storedAgentEmoji()).toEqual(['🫡']);
    await react('run_reaction_any_remove', { emoji: '🫡', remove: true });
});

test('a bare heart is stored as the emoji-presentation heart humans pick', async () => {
    const added = await react('run_reaction_bare_heart', { emoji: '❤' });

    expect(added.status).toBe(200);
    expect(await storedAgentEmoji()).toEqual(['❤️']);

    const removed = await react('run_reaction_bare_heart_remove', { emoji: '❤', remove: true });
    expect(removed.status).toBe(200);
    expect(await storedAgentEmoji()).toEqual([]);
});

test('an Agent can still remove an older reaction that is not one emoji', async () => {
    await fixture.harness.sql`
        insert into message_reactions (server_id, message_id, actor_agent_id, emoji)
        values (${fixture.serverId}, ${messageId}, ${fixture.orbitAgentId}, 'lgtm')
    `;

    const removed = await react('run_reaction_legacy_remove', { emoji: 'lgtm', remove: true });

    expect(removed.status).toBe(200);
    expect(await storedAgentEmoji()).toEqual([]);
});

test('humans keep reacting with any emoji text', async () => {
    const added = await fixture.owner.trpc.chat.react.mutate({
        emoji: '👍👍',
        messageId,
        serverId: fixture.serverId,
    });

    expect(added.message.reactions).toEqual([expect.objectContaining({ emoji: '👍👍' })]);
});
