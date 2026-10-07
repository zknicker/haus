import { expect, test } from 'bun:test';
import { formatInboxCheck, type InboxCheckInput } from './agent-inbox-format.ts';
import type { AgentInboxConversations, AgentInboxPendingRow } from './agent-inbox-schemas.ts';

const NOW_MS = Date.parse('2026-09-25T12:00:00.000Z');

const dmRow = {
    chatId: 'cht_richard',
    kind: 'dm' as const,
    lastReadSequence: 1200,
    latestAt: '2026-09-25T11:48:00.000Z',
    latestSenderHandle: 'richard',
    mentions: 0,
    target: 'dm:@richard',
    unread: 3,
};
const threadRow = {
    chatId: 'cht_thread',
    kind: 'thread' as const,
    lastReadSequence: 1180,
    latestAt: '2026-09-25T11:00:00.000Z',
    latestSenderHandle: 'alice',
    mentions: 1,
    target: '#general:3f4b1fd4',
    unread: 1,
};

test('empty inbox says so and ends with one Next line', () => {
    expect(render({ list: list() })).toBe(
        [
            'Inbox: nothing unread.',
            '',
            'Next: nothing to do; new messages will reach you as they arrive.',
        ].join('\n')
    );
});

test('a page with more renders open commands, the More trailer, and exactly one Next line', () => {
    const output = render({
        list: list({
            hasMore: true,
            items: [dmRow, threadRow],
            nextBefore: 1190,
            totals: { conversations: 43, dms: 2, mentions: 5 },
        }),
    });
    expect(output).toBe(
        [
            'Inbox: 43 unread conversations (2 DMs, 5 with mentions). Newest activity first.',
            '',
            'dm:@richard · 3 unread · latest @richard 12m ago',
            '  open: haus message read --target "dm:@richard" --after 1200',
            '#general:3f4b1fd4 · 1 unread · mentions you · latest @alice 1h ago',
            '  open: haus message read --target "#general:3f4b1fd4" --after 1180',
            '',
            'More: haus inbox check --before 1190',
            'Next: open the first conversation above: haus message read --target "dm:@richard" --after 1200',
        ].join('\n')
    );
    expect(output.match(/^Next:/gmu)?.length).toBe(1);
});

test('a singular count, repeat mentions, and old activity read naturally', () => {
    const output = render({
        list: list({
            items: [{ ...threadRow, latestAt: '2026-09-21T12:00:00.000Z', mentions: 3 }],
            totals: { conversations: 1, dms: 1, mentions: 0 },
        }),
    });
    expect(output.split('\n').slice(0, 3)).toEqual([
        'Inbox: 1 unread conversation (1 DM, 0 with mentions). Newest activity first.',
        '',
        '#general:3f4b1fd4 · 1 unread · mentions you 3x · latest @alice 4d ago',
    ]);
});

test('the last page has no More line and names its seq window', () => {
    const output = render({
        before: 1190,
        list: list({
            items: [
                {
                    ...dmRow,
                    kind: 'channel',
                    lastReadSequence: 0,
                    latestAt: null,
                    latestSenderHandle: null,
                    target: '#random',
                },
            ],
            totals: { conversations: 43, dms: 2, mentions: 5 },
        }),
    });
    expect(output).toBe(
        [
            'Inbox: 43 unread conversations (2 DMs, 5 with mentions). Activity before seq 1190, newest first.',
            '',
            '#random · 3 unread',
            '  open: haus message read --target "#random"',
            '',
            'Next: open the first conversation above: haus message read --target "#random"',
        ].join('\n')
    );
});

test('a page past the end points back to the newest page', () => {
    expect(
        render({ before: 5, list: list({ totals: { conversations: 3, dms: 0, mentions: 0 } }) })
    ).toBe(
        [
            'Inbox: 3 unread conversations (0 DMs, 0 with mentions).',
            '',
            'Next: no older unread conversations; run haus inbox check for the newest.',
        ].join('\n')
    );
});

test('mentions view has a mentions header and keeps the view on the More line', () => {
    const output = render({
        list: list({
            hasMore: true,
            items: [threadRow],
            nextBefore: 1190,
            totals: { conversations: 43, dms: 2, mentions: 5 },
            view: 'mentions',
        }),
        view: 'mentions',
    });
    expect(output).toStartWith(
        'Inbox: 5 conversations with unread mentions (of 43 unread conversations). Newest activity first.'
    );
    expect(output).toContain('\nMore: haus inbox check --view mentions --before 1190\n');

    expect(
        render({
            list: list({ totals: { conversations: 4, dms: 1, mentions: 0 }, view: 'mentions' }),
            view: 'mentions',
        })
    ).toBe(
        [
            'Inbox: no unread mentions (4 unread conversations in total).',
            '',
            'Next: run haus inbox check to list all unread conversations.',
        ].join('\n')
    );
    expect(
        render({
            before: 9,
            list: list({ totals: { conversations: 4, dms: 1, mentions: 2 }, view: 'mentions' }),
            view: 'mentions',
        })
    ).toEndWith('Next: no older mentions; run haus inbox check --view mentions for the newest.');
});

test('pending rows annotate listed targets and lead the first page when the list lags', () => {
    const output = render({
        list: list({ items: [dmRow], totals: { conversations: 1, dms: 1, mentions: 0 } }),
        pendingRows: [
            pending({ chatId: 'cht_richard', pendingCount: 2, target: 'dm:@richard' }),
            pending({ firstSequence: 1300, latestSender: 'bob', mentioned: true }),
        ],
    });
    expect(output).toBe(
        [
            'Inbox: 1 unread conversation (1 DM, 0 with mentions). Newest activity first.',
            '',
            '#ops · 1 new, not yet delivered · mentions you · latest @bob',
            '  open: haus message read --target "#ops" --after 1299',
            'dm:@richard · 3 unread · 2 new, not yet delivered · latest @richard 12m ago',
            '  open: haus message read --target "dm:@richard" --after 1200',
            '',
            'Next: open the first conversation above: haus message read --target "#ops" --after 1299',
        ].join('\n')
    );

    // Pending-only rows belong to the newest page, not to older pages.
    const older = render({
        before: 900,
        list: list({ items: [dmRow], totals: { conversations: 1, dms: 1, mentions: 0 } }),
        pendingRows: [pending({})],
    });
    expect(older).not.toContain('#ops');

    // An older Server sends no firstSequence: the open command has no --after.
    expect(
        render({ list: list(), pendingRows: [pending({ firstSequence: undefined })] })
    ).toContain('  open: haus message read --target "#ops"\n');
});

test('the mentions view leads only with mentioned pending rows', () => {
    const output = render({
        list: list({ totals: { conversations: 1, dms: 0, mentions: 0 }, view: 'mentions' }),
        pendingRows: [
            pending({ chatId: 'cht_quiet', target: '#quiet' }),
            pending({ mentioned: true }),
        ],
        view: 'mentions',
    });
    expect(output).toContain('#ops · 1 new, not yet delivered · mentions you · latest @zach');
    expect(output).not.toContain('#quiet');
});

test('Cloud Agent results fold into one row that points at message check', () => {
    const output = render({
        list: list({ items: [dmRow], totals: { conversations: 1, dms: 1, mentions: 0 } }),
        pendingRows: [
            pending({ cloudAgentResult: true, latestSender: 'haus', pendingCount: 2 }),
            pending({
                chatId: 'cht_richard',
                cloudAgentResult: true,
                latestSender: 'haus',
                target: 'dm:@richard',
            }),
        ],
    });
    expect(output).toBe(
        [
            'Inbox: 1 unread conversation (1 DM, 0 with mentions). Newest activity first.',
            '',
            'Cloud Agent results · 3 pending · fetch with haus message check',
            'dm:@richard · 3 unread · latest @richard 12m ago',
            '  open: haus message read --target "dm:@richard" --after 1200',
            '',
            'Next: fetch the Cloud Agent results above: haus message check',
        ].join('\n')
    );
});

test('a failed pending snapshot still lists conversations and says what is missing', () => {
    const output = render({
        list: list({ items: [dmRow], totals: { conversations: 1, dms: 1, mentions: 0 } }),
        pendingError: 'The Haus server is unavailable.',
    });
    expect(output).toEndWith(
        '\n\nPending queue unavailable (The Haus server is unavailable.); not-yet-delivered counts are not shown.'
    );
    expect(output).toContain('dm:@richard · 3 unread · latest @richard 12m ago');
});

function render(input: Partial<InboxCheckInput> & Pick<InboxCheckInput, 'list'>): string {
    return formatInboxCheck({ nowMs: NOW_MS, view: 'unread', ...input });
}

function list(overrides: Partial<AgentInboxConversations> = {}): AgentInboxConversations {
    return {
        hasMore: false,
        items: [],
        nextBefore: null,
        totals: { conversations: 0, dms: 0, mentions: 0 },
        view: 'unread',
        ...overrides,
    };
}

function pending(overrides: Partial<AgentInboxPendingRow>): AgentInboxPendingRow {
    return {
        chatId: 'cht_ops',
        cloudAgentResult: false,
        firstShortId: 'first',
        latestSender: 'zach',
        latestShortId: 'first',
        mentioned: false,
        pendingCount: 1,
        target: '#ops',
        taskNumber: null,
        ...overrides,
    };
}
