import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import type { HausClient } from './haus-client.ts';

const fixture = agentCreationFixture();
const askedContent = 'Benchmark the offer for Ada';
let runner: { token: string };
let bea: HausClient;
let dmMessageId: string;
let taskChatId: string;
let taskShortId: string;

async function agentPost(path: string, body: Record<string, unknown>) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return {
        body: (await response.json()) as {
            code?: string;
            message?: string | { id: string };
            task?: { key: string };
        },
        status: response.status,
    };
}

beforeAll(async () => {
    const { owner, serverId } = fixture;
    runner = await fixture.mintRunner('run_task_reminder_dm_origin');
    bea = await fixture.signIn('user_task_reminder_bea', ['bea-reminders@haus.test']);
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'bea-reminders@haus.test',
        serverId,
    });
    await bea.trpc.invitation.accept.mutate({ token });
    await fixture.harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${fixture.channelId}, ${await fixture.readUserId('user_task_reminder_bea')})
    `;
    const dm = await owner.trpc.chat.send.mutate({
        agentId: fixture.orbitAgentId,
        content: askedContent,
        nonce: 'task_reminder_dm_origin',
        serverId,
        targetKind: 'captain',
    });
    dmMessageId = dm.message.id;
    const started = await agentPost('/api/agent/tasks/start', {
        brief: 'Benchmark the offer against last year.',
        from: dmMessageId,
        machine: fixture.computerId,
        target: 'captain:@orbit',
        title: 'Benchmark the offer',
    });
    taskShortId = started.body.task?.shortId ?? '';
    taskChatId =
        (await owner.trpc.task.get.query({ serverId, shortId: taskShortId })).chatId ??
        'missing task chat';
});

afterAll(async () => {
    bea?.close();
});

test('a reminder on a Task started from a Captain chat anchors on the Task’s own brief', async () => {
    const scheduled = await agentPost('/api/agent/reminders/schedule', {
        commandId: 'task-reminder-dm-origin-brief',
        fireAt: '2099-01-01T00:00:00.000Z',
        target: `task:${taskShortId}`,
        title: 'Check the offer',
    });

    expect(scheduled.status).toBe(200);
    const anchors = (await fixture.harness.sql`
        select anchor_chat_id, anchor_message_id from reminders
        where title = 'Check the offer'
    `) as { anchor_chat_id: string; anchor_message_id: string }[];
    expect(anchors.map((row) => row.anchor_chat_id)).toEqual([taskChatId]);
    expect(anchors.map((row) => row.anchor_message_id)).not.toContain(dmMessageId);
});
