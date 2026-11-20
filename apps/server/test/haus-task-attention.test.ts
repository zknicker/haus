import { expect, test } from 'bun:test';
import { startTestTask } from './task-place-fixture.ts';
import { workerLinkHelpers } from './worker-link-helpers.ts';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();
const { agentPost } = workerLinkHelpers(fixture);

test('a followed Task wakes through a Channel mute; unfollow quiets it until a mention', async () => {
    const task = await startTestTask(fixture.harness, fixture.owner, {
        channelId: fixture.channelId,
        serverId: fixture.serverId,
        title: 'Attention check',
    });
    const [orbit] = (await fixture.harness.sql`
        select handle from agents where id = ${fixture.orbitAgentId}
    `) as { handle: string }[];
    const [channel] = (await fixture.harness.sql`
        select name from chats where id = ${fixture.channelId}
    `) as { name: string }[];
    const send = async (content: string, nonce: string) =>
        (
            await fixture.owner.trpc.chat.send.mutate({
                chatId: task.chatId,
                content,
                nonce,
                serverId: fixture.serverId,
            })
        ).message.id;

    await send(`@${orbit?.handle} take this one.`, 'attention-follow');
    expect(await followed()).toEqual([{ followed: true }]);
    const runner = await fixture.mintRunner('run_task_attention');
    const channelTarget = `#${channel?.name}`;
    expect(
        (await agentPost(runner, '/api/agent/channels/mute', { target: channelTarget })).status
    ).toBe(200);
    const ordinary = await send('Routine update.', 'attention-ordinary');
    expect(await pending(ordinary)).toEqual([{ mentioned: false, task_follow_reactivated: false }]);

    const target = `task:${task.key}`;
    expect(await agentPost(runner, '/api/agent/tasks/unfollow', { target })).toMatchObject({
        body: { target, unfollowed: true },
        status: 200,
    });
    expect(await followed()).toEqual([{ followed: false }]);
    expect(await pending(ordinary)).toEqual([]);
    expect(await pending(await send('Another routine update.', 'attention-quiet'))).toEqual([]);

    const mention = await send(`@${orbit?.handle} one direct follow-up.`, 'attention-mention');
    expect(await pending(mention)).toEqual([{ mentioned: true, task_follow_reactivated: true }]);
    expect(await followed()).toEqual([{ followed: true }]);
    const after = await send('Ordinary again.', 'attention-after');
    expect(await pending(after)).toEqual([{ mentioned: false, task_follow_reactivated: false }]);

    expect(
        (await agentPost(runner, '/api/agent/channels/unmute', { target: channelTarget })).status
    ).toBe(200);

    async function followed() {
        return await fixture.harness.sql`
            select followed from agent_task_follows
            where agent_id = ${fixture.orbitAgentId} and task_chat_id = ${task.chatId}
        `;
    }
});

async function pending(messageId: string) {
    return await fixture.harness.sql`
        select mentioned, task_follow_reactivated from agent_inbox
        where agent_id = ${fixture.orbitAgentId} and dedupe_key = ${messageId}
    `;
}
