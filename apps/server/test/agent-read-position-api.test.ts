import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let dmChatId: string;

beforeAll(async () => {
    dmChatId = (
        await fixture.owner.trpc.chat.ensureAgentDm.mutate({
            agentId: fixture.orbitAgentId,
            serverId: fixture.serverId,
        })
    ).id;
});

test("an Agent's own send reads through its message, which message read --unread starts after", async () => {
    const runner = await fixture.mintRunner('run_read_position_own', undefined, dmChatId);
    const { sequence } = await agentSend(runner, 'dm:@ada', 'read_position_own');
    expect(await readPosition(dmChatId)).toBe(sequence);

    const anchored = await agentGet(runner, '/api/agent/history', {
        after: '1',
        target: 'dm:@ada',
        unread: 'true',
    });
    expect(anchored).toMatchObject({
        body: {
            code: 'INVALID_ARG',
            message: '--unread cannot be combined with --before, --after, or --around.',
        },
        status: 400,
    });
    const unread = await agentGet(runner, '/api/agent/history', {
        target: 'dm:@ada',
        unread: 'true',
    });
    expect(unread).toMatchObject({
        body: {
            last_read: { after: sequence, unread_after: -1 },
            messages: [],
            read_through_seq: sequence,
            unread_after_seq: sequence,
        },
        status: 200,
    });
});

test('an Agent send into a DM leaves the human message it never saw unread', async () => {
    const human = await humanSend(dmChatId, 'Did you see the incident report?', 'dm_unseen_1');
    const runner = await fixture.mintRunner('run_read_position_dm', undefined, dmChatId);
    const sent = await agentSend(runner, 'dm:@ada', 'read_position_dm');

    expect(await readPosition(dmChatId)).toBe(human.sequence - 1);
    const inbox = await agentGet(runner, '/api/agent/inbox/conversations', {});
    expect(inbox.body.items).toEqual([
        expect.objectContaining({ chatId: dmChatId, target: 'dm:@ada', unread: 1 }),
    ]);

    const unread = await agentGet(runner, '/api/agent/history', {
        target: 'dm:@ada',
        unread: 'true',
    });
    expect(unread.body.messages?.map((message) => message.id)).toEqual([human.id, sent.id]);
    // `last_read` is the position before this read moved it (Raft parity).
    expect(unread.body).toMatchObject({
        last_read: { after: human.sequence - 1, unread_after: human.sequence - 1 },
        read_through_seq: sent.sequence,
        unread_after_seq: human.sequence - 1,
    });
    expect(await readPosition(dmChatId)).toBe(sent.sequence);
});

test('task create leaves an unseen channel message unread, and a plain read reports the pre-read position', async () => {
    const human = await humanSend(fixture.channelId, 'Release notes are up.', 'task_unseen_1');
    const runner = await fixture.mintRunner('run_read_position_task');
    const created = await fixture.post('/api/agent/tasks/create', runner, {
        nonce: 'read_position_task_1',
        target: '#product',
        titles: ['Proofread the release notes'],
    });
    expect(created.status).toBe(200);
    expect(await readPosition(fixture.channelId)).toBe(human.sequence - 1);

    const first = await agentGet(runner, '/api/agent/history', { target: '#product' });
    expect(first.body.last_read).toEqual({
        after: human.sequence - 1,
        unread_after: human.sequence - 1,
    });
    const latest = await readPosition(fixture.channelId);
    expect(latest).toBeGreaterThan(human.sequence);
    const second = await agentGet(runner, '/api/agent/history', { target: '#product' });
    expect(second.body.last_read).toEqual({ after: latest, unread_after: -1 });
});

async function readPosition(chatId: string) {
    const rows = (await fixture.harness.sql`
        select sequence from agent_chat_reads
        where server_id = ${fixture.serverId}
          and agent_id = ${fixture.orbitAgentId}
          and chat_id = ${chatId}
    `) as { sequence: number }[];
    return rows[0]?.sequence ?? 0;
}

async function humanSend(chatId: string, content: string, nonce: string) {
    const sent = await fixture.owner.trpc.chat.send.mutate({
        chatId,
        content,
        nonce,
        serverId: fixture.serverId,
    });
    return { id: sent.message.id, sequence: sent.message.sequence };
}

async function agentSend(runner: { token: string }, target: string, nonce: string) {
    const response = await fixture.post('/api/agent/messages/send', runner, {
        content: `Agent note ${nonce}.`,
        nonce,
        target,
    });
    expect(response.status).toBe(200);
    const { message } = response.body as unknown as { message: { id: string; sequence: number } };
    return message;
}

async function agentGet(runner: { token: string }, path: string, query: Record<string, string>) {
    const url = new URL(path, fixture.harness.url);
    for (const [name, value] of Object.entries(query)) {
        url.searchParams.set(name, value);
    }
    const response = await fetch(url, { headers: { authorization: `Bearer ${runner.token}` } });
    return {
        body: (await response.json()) as {
            code?: string;
            items?: Record<string, unknown>[];
            last_read?: { after: number; unread_after: number };
            messages?: Array<{ id: string }>;
            read_through_seq?: number;
            unread_after_seq?: number;
        },
        status: response.status,
    };
}
