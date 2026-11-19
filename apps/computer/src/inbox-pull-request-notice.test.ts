import { expect, test } from 'bun:test';
import { agentInboxItemSchema } from '@haus/api';
import { parseInbox } from './agent-inbox-input.ts';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { composeInboxDrain, composeInboxNotice } from './inbox-format.ts';

const url = 'https://github.com/haus/haus/pull/41';

test('parses a Task pull request notice the Server contract accepts', () => {
    const wire = noticeItem();
    expect(agentInboxItemSchema.safeParse(wire).success).toBe(true);

    const [parsed] = parseInbox([wire]) ?? [];

    expect(parsed?.pullRequestNotice).toEqual({ change: 'checks_failing', url });
    expect(parsed?.target).toBe('task:HAUS-12');
});

test('tolerates a field a newer Server adds to the notice', () => {
    const wire = noticeItem({ pullRequestNotice: { change: 'checks_passing', url, number: 41 } });

    expect(parseInbox([wire])?.[0]?.pullRequestNotice).toMatchObject({
        change: 'checks_passing',
        url,
    });
});

test('rejects a notice with an unknown change, a cursor, or cloud work beside it', () => {
    expect(parseInbox([noticeItem({ pullRequestNotice: { change: 'merged', url } })])).toBeNull();
    expect(parseInbox([noticeItem({ sequence: 4 })])).toBeNull();
    expect(parseInbox([noticeItem({ senderType: 'human' })])).toBeNull();
    expect(
        parseInbox([
            noticeItem({
                worker: {
                    branches: [],
                    errorCode: null,
                    notice: 'pull_request',
                    provider: 'cursor',
                    providerUrl: null,
                    repository: 'haus/haus',
                    turnId: 'car_1234567890abcdef',
                    stallCode: null,
                    status: 'completed',
                    summary: null,
                    title: 'Fix the flaky delivery test',
                    workerId: 'caw_1234567890abcdef',
                },
            }),
        ])
    ).toBeNull();
});

test('renders the Task, the change in plain words, and the URL', () => {
    const [parsed] = parseInbox([noticeItem()]) ?? [];
    if (!parsed) {
        throw new Error('expected the notice to parse');
    }

    const drain = composeInboxDrain([parsed]);

    expect(drain).toContain(
        [
            '[Haus pull request attention change=checks_failing target=task:HAUS-12]',
            `The pull request attached to Task HAUS-12 has failing checks: ${url}`,
            'Report what you learn in the Task: haus message send --target task:HAUS-12',
        ].join('\n')
    );
    expect(drain).not.toContain('[target=task:HAUS-12 msg=');
});

test('names each change in plain words', () => {
    const lines = (['ready_for_review', 'checks_passing'] as const).map((change) =>
        composeInboxDrain([item({ pullRequestNotice: { change, url } })])
    );

    expect(lines[0]).toContain(`attached to Task HAUS-12 is ready for review: ${url}`);
    expect(lines[1]).toContain(`attached to Task HAUS-12 has its checks passing: ${url}`);
});

test('counts the notice as pending work, not an unread message', () => {
    const notice = composeInboxNotice([item({})]);

    expect(notice).toContain('Inbox update: 1 pending work item total; 1 changed target');
    expect(notice).toContain('task:HAUS-12  pending: 1 work item');
    expect(notice).not.toContain('pending: 1 message');
    expect(notice).not.toContain(url);
});

test('an item with neither attention still renders as a message', () => {
    const message = item({
        content: 'Ship it?',
        id: 'msg_1234567890abcdef',
        pullRequestNotice: undefined,
        senderHandle: 'zach',
        senderType: 'human',
        sequence: 7,
    });
    const [parsed] = parseInbox([message]) ?? [];

    if (!parsed) {
        throw new Error('expected the message to parse');
    }
    expect(parsed.pullRequestNotice).toBeUndefined();
    const drain = composeInboxDrain([parsed]);
    expect(drain).toContain('[target=task:HAUS-12 msg=');
    expect(drain).toContain('type=human] zach: Ship it?');
    expect(drain).not.toContain('pull request attention');
});

function noticeItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...item({}), ...overrides };
}

function item(overrides: Partial<AgentInboxItem>): AgentInboxItem {
    return {
        chatId: 'cht_task1234567890',
        content: `The pull request on HAUS-12 has failing checks: ${url}`,
        createdAt: '2026-11-17T12:00:00.000Z',
        id: 'prn_1234567890abcdef',
        pullRequestNotice: { change: 'checks_failing', url },
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
        target: 'task:HAUS-12',
        ...overrides,
    };
}
