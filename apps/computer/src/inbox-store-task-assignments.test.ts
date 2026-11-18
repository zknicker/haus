import { beforeEach, expect, test } from 'bun:test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { noticePath } from './delivery.ts';
import {
    acceptRunInbox,
    consumeVisibleMessages,
    readPendingInboxState,
    replacePendingInbox,
} from './inbox-store.ts';

let dataRoot: string;
const location = () => ({ agentId: 'agt_tasks', dataRoot, serverId: 'srv_tasks' });
const storedNotice = () => noticePath(dataRoot, { agentId: 'agt_tasks', serverId: 'srv_tasks' });
const tasks = { ids: ['task-assign:tsk_one:1', 'task-assign:tsk_two:1'], total: 2 };
const receipt = { runId: 'run_busy', workIds: tasks.ids };

const message: AgentInboxItem = {
    chatId: 'cht_inbox',
    content: 'hello',
    createdAt: '2026-11-04T10:00:00.000Z',
    id: 'msg_one',
    senderHandle: 'ada',
    senderType: 'human',
    sequence: 1,
    target: '#general',
};

beforeEach(async () => {
    if (dataRoot) {
        await rm(dataRoot, { force: true, recursive: true });
    }
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-inbox-tasks-'));
});

test('a notice of assignments alone is delivered with its receipt', async () => {
    const delivered: string[] = [];
    const notice = await replacePendingInbox(
        location(),
        [],
        0,
        async (text) => {
            delivered.push(text);
        },
        receipt,
        tasks
    );
    expect(notice).toContain('2 tasks assigned to you');
    expect(delivered).toEqual([notice ?? '']);
    const stored = JSON.parse(await readFile(storedNotice(), 'utf8'));
    expect(stored.receipt).toEqual(receipt);
});

test('the count survives a Chat row leaving the mirror', async () => {
    await replacePendingInbox(location(), [message], 1, undefined, undefined, tasks);
    await consumeVisibleMessages(location(), [
        { chatId: message.chatId, id: message.id, sequence: 1 },
    ]);
    expect((await readPendingInboxState(location())).taskAssignments).toEqual(tasks);
    const stored = JSON.parse(await readFile(storedNotice(), 'utf8'));
    expect(stored.notice).toContain('2 tasks assigned to you');
    expect(stored.notice).not.toContain('#general');
});

test('a run carrying the assignments clears the count and its stored notice', async () => {
    await replacePendingInbox(location(), [], 0, undefined, receipt, tasks);
    await acceptRunInbox(location(), 'run_other', []);
    expect((await readPendingInboxState(location())).taskAssignments).toEqual(tasks);

    await acceptRunInbox(location(), 'run_tasks', [], true);
    expect((await readPendingInboxState(location())).taskAssignments).toBeUndefined();
    await expect(access(storedNotice())).rejects.toMatchObject({ code: 'ENOENT' });
});

test('a later snapshot without assignments drops the count', async () => {
    await replacePendingInbox(location(), [message], 1, undefined, undefined, tasks);
    await replacePendingInbox(location(), [message], 1);
    expect((await readPendingInboxState(location())).taskAssignments).toBeUndefined();
});
