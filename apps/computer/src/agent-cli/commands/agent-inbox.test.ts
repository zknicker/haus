import { expect, test } from 'bun:test';
import type { AgentInboxItem } from '../../agent-inbox-item.ts';
import { composeInboxNotice } from '../../inbox-format.ts';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { runInboxCheck } from './agent-inbox.ts';

test('inbox check prints each target exactly as the busy notice does', async () => {
    const items: AgentInboxItem[] = [
        item({
            ask: { addresseeHandle: 'zach', status: 'open' },
            id: 'msg_askfirst',
            mentioned: true,
            task: {
                assigneeAgentId: null,
                assigneeUserId: null,
                messageId: 'msg_askfirst',
                number: 7,
                priority: 'none',
                status: 'todo',
            },
            target: '#general:abcd1234',
        }),
        item({ chatId: 'cht_dm', id: 'msg_dmreply', senderHandle: 'rosa', target: 'dm:@rosa' }),
    ];
    const noticeRows = (composeInboxNotice(items) ?? '').split('\n').slice(2, -1);
    const output = await inboxCheck([
        row({
            ask: { addresseeHandle: 'zach', status: 'open' },
            firstShortId: 'askfirst',
            latestShortId: 'askfirst',
            mentioned: true,
            target: '#general:abcd1234',
            taskNumber: 7,
        }),
        row({
            chatId: 'cht_dm',
            firstShortId: 'dmreply',
            latestSender: 'rosa',
            latestShortId: 'dmreply',
            target: 'dm:@rosa',
        }),
    ]);

    expect(noticeRows).toEqual([
        '#general:abcd1234  pending: 1 message · first msg=askfirst · latest sender @zach · latest msg=askfirst · thread · task #7 · ask open to=@zach · you were mentioned',
        'dm:@rosa  pending: 1 message · first msg=dmreply · latest sender @rosa · latest msg=dmreply · dm',
    ]);
    expect(output).toBe(
        `${[...noticeRows, 'Read pending bodies with haus message check.'].join('\n')}\n`
    );
});

test('inbox check tags a waiting Cloud Agent result as work, like the notice', async () => {
    const output = await inboxCheck([
        row({
            cloudAgentResult: true,
            firstShortId: '-',
            latestShortId: '-',
            latestSender: 'haus',
        }),
    ]);
    expect(output).toBe(
        '#general  pending: 1 work item · first msg=- · latest sender @haus · latest msg=- · cloud agent result\nRead pending bodies with haus message check.\n'
    );
});

test('rows from a Server that predates the work facts still print, untagged', async () => {
    const { ask: _ask, cloudAgentResult: _cloud, taskNumber: _task, ...legacy } = row({});
    const output = await inboxCheck([{ ...legacy, dm: false, thread: false }]);
    expect(output).toBe(
        '#general  pending: 1 message · first msg=first · latest sender @zach · latest msg=first\nRead pending bodies with haus message check.\n'
    );
});

async function inboxCheck(rows: Record<string, unknown>[]): Promise<string> {
    let written = '';
    const client: AgentApiRequester = {
        request: async (_route, schema) => schema.parse({ rows, totalPending: rows.length }),
    };
    expect(
        await runInboxCheck({
            client,
            write: (text) => {
                written += text;
            },
        })
    ).toBe(0);
    return written;
}

function row(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        ask: null,
        chatId: 'cht_general',
        cloudAgentResult: false,
        firstShortId: 'first',
        latestSender: 'zach',
        latestShortId: 'first',
        mentioned: false,
        pendingCount: 1,
        target: '#general',
        taskNumber: null,
        ...overrides,
    };
}

function item(overrides: Partial<AgentInboxItem>): AgentInboxItem {
    return {
        chatId: 'cht_general',
        content: 'Ship it',
        createdAt: '2026-07-27T00:00:00.000Z',
        id: 'msg_first',
        senderHandle: 'zach',
        senderType: 'human',
        sequence: 1,
        target: '#general',
        ...overrides,
    };
}
