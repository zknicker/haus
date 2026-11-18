import { expect, test } from 'bun:test';

import type { CloudAgentWork } from '@haus/api';

import { buildInboxItems } from '../src/agent-delivery/inbox-items.ts';
import { listInboxItemsByDedupeKeys } from '../src/agent-delivery/store.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';
import { cloudAgentLinkHelpers } from './cloud-agent-link-helpers.ts';

const fixture = cloudAgentFixture();
const links = cloudAgentLinkHelpers(fixture);

test('a launch on a Task posts in the Task, attaches to it, and reports there', async () => {
    const placed = await launch('place-task');
    const taskTarget = `task:${fixture.task.key}`;
    expect(placed.receipt).toMatchObject({ chatId: fixture.task.chatId, target: taskTarget });
    expect(await chatOf(placed.messageId)).toBe(fixture.task.chatId);
    expect(await chatsUnder(fixture.task.chatId, placed.messageId)).toEqual([]);
    const [work] = (await fixture.harness.sql`
        select chat_id, task_id from cloud_agent_work where id = ${placed.work.id}
    `) as { chat_id: string; task_id: string }[];
    expect(work).toEqual({ chat_id: fixture.task.chatId, task_id: fixture.task.id });
    expect(await settleTarget(placed)).toBe(fixture.task.chatId);
    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        await fixture.harness.sql`
            update agent_inbox set run_id = 'run_placement_read' where dedupe_key = ${placed.runId}
        `;
        const rows = await listInboxItemsByDedupeKeys(connection.db, {
            agentId: fixture.orbitAgentId,
            dedupeKeys: [placed.runId],
            runId: 'run_placement_read',
        });
        expect((await buildInboxItems(connection.db, rows)).map((item) => item.target)).toEqual([
            taskTarget,
        ]);
    } finally {
        await connection.close();
    }
});

test('the CLI shape, target task:KEY plus task, launches on that Task', async () => {
    const runner = await fixture.mintRunner('run_place-cli-shape');
    await fixture.readTarget(runner, `task:${fixture.task.key}`);
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'place-cli-shape', target: `task:${fixture.task.key}` })
    );
    expect(started).toMatchObject({
        body: { chatId: fixture.task.chatId, target: `task:${fixture.task.key}` },
        status: 200,
    });
});

test('a launch into a done Task reopens it', async () => {
    await fixture.harness
        .sql`update tasks set state = 'done', completed_at = now() where id = ${fixture.task.id}`;
    await launch('place-reopen');
    const [task] = (await fixture.harness.sql`
        select state from tasks where id = ${fixture.task.id}
    `) as { state: string }[];
    expect(task?.state).toBe('open');
});

test('a launch with no Task is refused, says why, and writes nothing', async () => {
    const { task: _task, ...withoutTask } = fixture.startBody({ nonce: 'place-no-task' });
    const refused = await refuseLaunch(withoutTask);
    expect(refused.code).toBe('CLOUD_AGENT_TASK_REQUIRED');
    expect(refused.message).toContain('Start a Task');
});

test('a launch on a Task the Agent cannot reach is refused the same way', async () => {
    const refused = await refuseLaunch(
        fixture.startBody({ nonce: 'place-unknown-task', task: 'ZZZ-999' })
    );
    expect(refused).toMatchObject({ code: 'CLOUD_AGENT_TASK_REQUIRED' });
    expect(refused.message).toContain('ZZZ-999');
});

test('a send to a <target>:<shortId> is refused with what to do instead, and writes nothing', async () => {
    const anchor = await links.humanSend(
        fixture.owner,
        fixture.channelId,
        'What broke the deploy?',
        'place-send-anchor'
    );
    const shortId = anchor.message.id.replace(/^msg_/u, '').slice(0, 8);
    const runner = await fixture.mintRunner('run_place-send-shortid');
    await fixture.readTarget(runner, '#product');
    const sent = await links.agentPost(runner, '/api/agent/messages/send', {
        content: 'Looking into it here.',
        nonce: 'place-send-shortid',
        target: `#product:${shortId}`,
    });
    expect(sent).toMatchObject({ body: { code: 'INVALID_TARGET' }, status: 404 });
    const message = (sent.body as { message: string }).message;
    expect(message).toContain(`--reply-to ${shortId}`);
    expect(message).toContain('haus task start');
    expect(await chatsUnder(fixture.channelId, anchor.message.id)).toEqual([]);
    const written = (await fixture.harness.sql`
        select id from chat_messages where nonce = 'place-send-shortid'
    `) as { id: string }[];
    expect(written).toEqual([]);
});

async function refuseLaunch(body: Record<string, string>) {
    const runner = await fixture.mintRunner(`run_${body.nonce}`);
    const workBefore = await fixture.countWork();
    const started = await fixture.postStart(runner, body);
    expect(started.status).toBe(400);
    expect(await fixture.countWork()).toBe(workBefore);
    const written = (await fixture.harness.sql`
        select id from chat_messages where server_id = ${fixture.serverId} and nonce = ${body.nonce}
    `) as { id: string }[];
    expect(written).toEqual([]);
    return started.body as { code?: string; message?: string };
}

async function launch(nonce: string) {
    const runner = await fixture.mintRunner(`run_${nonce}`);
    await fixture.readTarget(runner, `task:${fixture.task.key}`);
    const started = await fixture.postStart(runner, fixture.startBody({ nonce }));
    expect(started).toMatchObject({ status: 200 });
    const work = started.body.work as CloudAgentWork;
    expect(work.messageId).toBe(started.body.messageId ?? '');
    return {
        messageId: started.body.messageId as string,
        receipt: started.body,
        runId: started.body.runId as string,
        work,
    };
}

async function chatOf(messageId: string) {
    const [row] = (await fixture.harness.sql`
        select chat_id from chat_messages where id = ${messageId}
    `) as { chat_id: string }[];
    return row?.chat_id;
}

async function chatsUnder(parentChatId: string, anchorMessageId: string) {
    const rows = (await fixture.harness.sql`
        select id from chats
        where parent_chat_id = ${parentChatId} and anchor_message_id = ${anchorMessageId}
    `) as { id: string }[];
    return rows.map((row) => row.id);
}

/** Settles the Run and returns the Chat its completion notice targeted. */
async function settleTarget(placed: { runId: string; work: CloudAgentWork }) {
    const socket = await fixture.attachComputer();
    await links.observe(socket, {
        observedAt: '2026-10-11T15:00:00.000Z',
        runId: placed.runId,
        status: 'completed',
        workId: placed.work.id,
    });
    socket.close();
    const [row] = (await fixture.harness.sql`
        select chat_id from agent_inbox
        where source = 'cloud_agent_work' and dedupe_key = ${placed.runId}
    `) as { chat_id: string }[];
    return row?.chat_id;
}
