import { expect, test } from 'bun:test';
import { createTestProject } from './project.fixture.ts';
import { taskBoardFixture } from './task-board.fixture.ts';
import { startTestTask } from './task-place-fixture.ts';

const fixture = taskBoardFixture();
const { agentPost } = fixture;

test('a followed Task outside the home wakes the Agent; unfollow quiets it until a mention', async () => {
    const design = await createTestProject(fixture.owner, {
        agentIds: [],
        key: 'DSN',
        name: 'design',
        serverId: fixture.serverId,
    });
    const task = await startTestTask(fixture.harness, fixture.owner, {
        channelId: design.id,
        serverId: fixture.serverId,
        title: 'Attention check',
    });
    const [orbit] = (await fixture.harness.sql`
        select handle from agents where id = ${fixture.orbitAgentId}
    `) as { handle: string }[];
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
    const ordinary = await send('Routine update.', 'attention-ordinary');
    expect(await pending(ordinary)).toEqual([{ mentioned: false, task_follow_reactivated: false }]);

    const target = `task:${task.shortId}`;
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
